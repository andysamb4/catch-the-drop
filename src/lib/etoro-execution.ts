import { randomUUID } from "crypto";
import { logBotEvent } from "@/lib/bot-log";
import { isRealTradingAllowed, type EtoroMode } from "@/lib/trading-config";

// eToro execution client. ALL order traffic goes through this module so the
// demo/real routing and the real-money guard live in exactly one place.
//
// Endpoint shapes (from api-portal.etoro.com OpenAPI spec v1.296.0) — note the
// demo/real path patterns differ per endpoint family, so each operation maps
// its paths explicitly rather than string-substituting a "/demo/" segment:
//
//   place order   POST /api/v2/trading/execution/demo/orders   | /api/v2/trading/execution/orders
//   order info    GET  /api/v1/trading/info/demo/orders/{id}   | /api/v1/trading/info/real/orders/{id}
//   open pos+P&L  GET  /api/v1/trading/info/demo/pnl           | /api/v1/trading/info/real/pnl
//   closed trades GET  /api/v1/trading/info/trade/demo/history | /api/v1/trading/info/trade/history
//   edit TP/SL    PATCH /api/v2/trading/demo/positions/{id}    | /api/v2/trading/positions/{id}
//
// eToro also exposes a WebSocket "private" topic with order/position events,
// but Vercel serverless functions can't hold a persistent socket, so close
// detection falls back to polling reconciliation (see auto-trade.ts).

const ETORO_ORIGIN = "https://public-api.etoro.com";

export class RealTradingBlockedError extends Error {
  constructor(operation: string) {
    super(
      `${operation} refused: ETORO_MODE=real but ETORO_ALLOW_REAL is not "true". ` +
        "Set both flags explicitly to trade real money."
    );
    this.name = "RealTradingBlockedError";
  }
}

// Hard guard on every mutating call. Demo always passes; real requires the
// second explicit flag so a lone ETORO_MODE typo can never reach real funds.
function assertMutationAllowed(mode: EtoroMode, operation: string): void {
  if (mode === "real" && !isRealTradingAllowed()) {
    throw new RealTradingBlockedError(operation);
  }
}

async function executionFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const apiKey = process.env.ETORO_API_KEY;
  const userKey = process.env.ETORO_USER_KEY;
  if (!apiKey || !userKey) {
    throw new Error("ETORO_API_KEY / ETORO_USER_KEY are not set");
  }

  const res = await fetch(`${ETORO_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-request-id": randomUUID(),
      "x-api-key": apiKey,
      "x-user-key": userKey,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `eToro ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type PlaceOrderParams = {
  mode: EtoroMode;
  symbol: string;
  instrumentId: number;
  direction: "LONG" | "SHORT";
  amountUsd: number;
  takeProfitRate?: number;
  stopLossRate?: number;
};

export type PlaceOrderResult = {
  token: string;
  orderId: number;
  referenceId: string;
};

// Market order, $-sized, leverage 1. The take-profit rides on the order itself
// (eToro's native takeProfitRate) so the close is executed server-side by eToro.
// Placed outside market hours the order queues and fills at the next open.
export async function placeMarketOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const operation = `Market order ${params.direction} ${params.symbol} $${params.amountUsd}`;
  try {
    assertMutationAllowed(params.mode, operation);
  } catch (err) {
    await logBotEvent(params.mode, "ORDER_BLOCKED", (err as Error).message, {
      symbol: params.symbol,
    });
    throw err;
  }

  const path =
    params.mode === "demo"
      ? "/api/v2/trading/execution/demo/orders"
      : "/api/v2/trading/execution/orders";

  // eToro's execution API rejects "sell"/"buyToCover" ("not supported in the
  // current implementation") — shorts open as "sellShort", and every sellShort
  // must carry a stopLossRate or it 400s. Verified against demo 2026-07-13.
  if (params.direction === "SHORT" && params.stopLossRate === undefined) {
    const err = new Error(`${operation} refused: eToro requires a stopLossRate on short orders`);
    await logBotEvent(params.mode, "ORDER_BLOCKED", err.message, { symbol: params.symbol });
    throw err;
  }

  const body = {
    action: "open",
    transaction: params.direction === "LONG" ? "buy" : "sellShort",
    instrumentId: params.instrumentId,
    orderType: "mkt",
    leverage: 1,
    amount: params.amountUsd,
    orderCurrency: "usd",
    ...(params.takeProfitRate !== undefined && { takeProfitRate: params.takeProfitRate }),
    ...(params.stopLossRate !== undefined && {
      stopLossRate: params.stopLossRate,
      stopLossType: "fixed",
    }),
  };

  try {
    const result = await executionFetch<PlaceOrderResult>(path, { method: "POST", body });
    await logBotEvent(params.mode, "ORDER_PLACED", operation, {
      symbol: params.symbol,
      payload: { request: body, response: result },
    });
    return result;
  } catch (err) {
    await logBotEvent(params.mode, "ORDER_REJECTED", `${operation} — ${(err as Error).message}`, {
      symbol: params.symbol,
      payload: { request: body },
    });
    throw err;
  }
}

export type OrderInfo = {
  orderID: number;
  statusID: number;
  errorCode: number | null;
  errorMessage: string | null;
  instrumentID: number;
  amount: number;
  units: number;
  positions: Array<{
    positionID: number;
    occurred: string;
    rate: number;
    units: number;
    amount: number;
    isOpen: boolean;
  }>;
};

// Fill status for a previously placed order; positions[] is populated once
// the order has executed (positions[].rate is the actual fill price).
export async function getOrderInfo(mode: EtoroMode, orderId: string): Promise<OrderInfo> {
  const path =
    mode === "demo"
      ? `/api/v1/trading/info/demo/orders/${orderId}`
      : `/api/v1/trading/info/real/orders/${orderId}`;
  return executionFetch<OrderInfo>(path);
}

export type LivePosition = {
  positionID: number;
  instrumentID: number;
  isBuy: boolean;
  leverage: number;
  openRate: number;
  units: number;
  amount: number;
  initialAmountInDollars: number;
  openDateTime: string;
  takeProfitRate?: number;
  stopLossRate?: number;
  unrealizedPnL?: {
    pnL: number;
    closeRate: number;
    timestamp: string;
  } | null;
};

export type LivePortfolio = {
  positions: LivePosition[];
  credit: number;
  unrealizedPnL: number;
};

// Open positions with embedded live P&L, plus account cash (credit).
export async function getLivePortfolio(mode: EtoroMode): Promise<LivePortfolio> {
  const path = mode === "demo" ? "/api/v1/trading/info/demo/pnl" : "/api/v1/trading/info/real/pnl";
  const data = await executionFetch<{ clientPortfolio: LivePortfolio }>(path);
  return data.clientPortfolio;
}

export type ClosedTrade = {
  positionId: number;
  instrumentId: number;
  isBuy: boolean;
  openRate: number;
  closeRate: number;
  openTimestamp: string;
  closeTimestamp: string;
  netProfit: number;
  takeProfitRate: number;
  stopLossRate: number;
  investment: number;
  fees: number;
  units: number;
};

// Closed positions since minDate, newest pages first. eToro reports realized
// P&L (netProfit) and the close rate but no explicit close reason — callers
// infer take-profit closes by comparing closeRate against takeProfitRate.
export async function getTradeHistory(mode: EtoroMode, minDate: Date): Promise<ClosedTrade[]> {
  const base =
    mode === "demo" ? "/api/v1/trading/info/trade/demo/history" : "/api/v1/trading/info/trade/history";

  const all: ClosedTrade[] = [];
  const pageSize = 100;
  for (let page = 1; page <= 10; page++) {
    const trades = await executionFetch<ClosedTrade[]>(
      `${base}?minDate=${encodeURIComponent(minDate.toISOString())}&page=${page}&pageSize=${pageSize}`
    );
    if (!Array.isArray(trades) || trades.length === 0) break;
    all.push(...trades);
    if (trades.length < pageSize) break;
  }
  return all;
}

// Adjusts the server-side take-profit on an open position. Used after fill to
// re-anchor the TP from the pre-trade estimate to the actual entry price.
export async function updatePositionTakeProfit(
  mode: EtoroMode,
  positionId: string,
  takeProfitRate: number
): Promise<void> {
  assertMutationAllowed(mode, `Update take-profit on position ${positionId}`);
  const path =
    mode === "demo"
      ? `/api/v2/trading/demo/positions/${positionId}`
      : `/api/v2/trading/positions/${positionId}`;
  await executionFetch(path, { method: "PATCH", body: { takeProfitRate } });
}
