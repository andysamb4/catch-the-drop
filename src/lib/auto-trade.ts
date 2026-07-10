import { prisma } from "@/lib/db";
import { logBotEvent } from "@/lib/bot-log";
import {
  getLivePortfolio,
  getOrderInfo,
  getTradeHistory,
  placeMarketOrder,
  updatePositionTakeProfit,
  type LivePortfolio,
} from "@/lib/etoro-execution";
import {
  TRADE_SIZE_USD,
  isAutoTradeEnabled,
  stopLossRateFor,
  takeProfitRateFor,
  type EtoroMode,
} from "@/lib/trading-config";
import type { BotPosition } from "@/generated/prisma/client";

// If the fill price drifted from the signal close this estimates the TP from,
// re-anchor the server-side TP to the actual entry. 0.1% keeps noise PATCHes away.
const TP_DRIFT_TOLERANCE = 0.001;
// closeRate within 0.2% of the TP target (or beyond it) counts as a take-profit
// close — eToro's history carries no explicit close-reason field.
const TP_HIT_TOLERANCE = 0.002;
// A PENDING order that never produced a position within a week is dead
// (rejected upstream, cancelled, or the instrument was untradeable).
const PENDING_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type SignalOrderInput = {
  signalId: string;
  symbol: string;
  instrumentId: number;
  type: "BUY" | "SHORT";
  // Latest close from the detection series — the entry estimate the TP is
  // anchored to until the real fill price is known (see reconcile).
  lastClose: number;
};

export type SignalOrderOutcome = {
  symbol: string;
  outcome: "placed" | "skipped" | "failed";
  detail: string;
};

// Places the $TRADE_SIZE_USD market order for a confirmed signal, with eToro's
// native take-profit attached. Signals detected after the close queue on eToro
// and fill at the next open; the trade-sync poll then records the actual entry.
export async function executeSignalOrder(
  mode: EtoroMode,
  input: SignalOrderInput
): Promise<SignalOrderOutcome> {
  const direction = input.type === "BUY" ? "LONG" : "SHORT";

  if (!isAutoTradeEnabled()) {
    return { symbol: input.symbol, outcome: "skipped", detail: "auto-trade disabled" };
  }

  // One position per symbol per mode: a 4-day streak re-fires the signal that a
  // 3-day streak already traded — don't pyramid $100 onto it every day.
  const existing = await prisma.botPosition.findFirst({
    where: {
      mode,
      symbol: input.symbol,
      OR: [{ status: "PENDING" }, { status: "OPEN" }, { signalId: input.signalId }],
    },
  });
  if (existing) {
    const detail =
      existing.signalId === input.signalId
        ? "already traded this signal"
        : `already has a ${existing.status.toLowerCase()} position`;
    await logBotEvent(mode, "ORDER_SKIPPED", `${input.symbol} ${direction}: ${detail}`, {
      symbol: input.symbol,
    });
    return { symbol: input.symbol, outcome: "skipped", detail };
  }

  const takeProfitRate = takeProfitRateFor(direction, input.lastClose);
  const stopLossRate = stopLossRateFor(direction, input.lastClose);

  try {
    const order = await placeMarketOrder({
      mode,
      symbol: input.symbol,
      instrumentId: input.instrumentId,
      direction,
      amountUsd: TRADE_SIZE_USD,
      takeProfitRate,
      stopLossRate,
    });

    await prisma.botPosition.create({
      data: {
        mode,
        symbol: input.symbol,
        instrumentId: input.instrumentId,
        direction,
        status: "PENDING",
        orderId: String(order.orderId),
        requestedUsd: TRADE_SIZE_USD,
        takeProfitRate,
        stopLossRate,
        signalId: input.signalId,
      },
    });
    return { symbol: input.symbol, outcome: "placed", detail: `order ${order.orderId}` };
  } catch (err) {
    const message = (err as Error).message;
    await prisma.botPosition
      .create({
        data: {
          mode,
          symbol: input.symbol,
          instrumentId: input.instrumentId,
          direction,
          status: "FAILED",
          requestedUsd: TRADE_SIZE_USD,
          takeProfitRate,
          stopLossRate,
          signalId: input.signalId,
          error: message.slice(0, 1000),
        },
      })
      .catch(() => {});
    return { symbol: input.symbol, outcome: "failed", detail: message };
  }
}

export type ReconcileResult = {
  portfolio: LivePortfolio;
  filled: number;
  closed: number;
  failed: number;
  stillPending: number;
  open: number;
};

// Polling reconciliation — the app never closes positions itself; eToro does,
// server-side, when the take-profit hits. Each poll:
//   PENDING -> OPEN    when the order reports an executed position (records fill
//                      price, re-anchors TP to it), or -> FAILED on rejection.
//   OPEN    -> CLOSED  when the position leaves eToro's open list; realized P&L
//                      and close rate come from trade history, and the close
//                      reason is inferred from closeRate vs the TP target.
// (eToro's WebSocket "private" topic would push these events in real time, but
// serverless can't hold the connection — polling is the documented fallback.)
export async function reconcilePositions(mode: EtoroMode): Promise<ReconcileResult> {
  const tracked = await prisma.botPosition.findMany({
    where: { mode, status: { in: ["PENDING", "OPEN"] } },
    orderBy: { openedAt: "asc" },
  });

  const portfolio = await getLivePortfolio(mode);
  const openIds = new Set(portfolio.positions.map((p) => String(p.positionID)));

  let filled = 0;
  let closed = 0;
  let failed = 0;

  const pending = tracked.filter((p) => p.status === "PENDING");
  for (const pos of pending) {
    try {
      const outcome = await resolvePendingOrder(mode, pos);
      if (outcome === "filled") filled++;
      if (outcome === "failed") failed++;
    } catch (err) {
      await logBotEvent(mode, "ERROR", `order ${pos.orderId} lookup failed: ${(err as Error).message}`, {
        symbol: pos.symbol,
      });
    }
  }

  const open = tracked.filter((p) => p.status === "OPEN");
  const vanished = open.filter((p) => p.positionId && !openIds.has(p.positionId));
  if (vanished.length > 0) {
    const earliest = vanished.reduce(
      (min, p) => (p.openedAt < min ? p.openedAt : min),
      vanished[0].openedAt
    );
    // One day of slack: openedAt is order time, the fill may be the next session.
    const history = await getTradeHistory(mode, new Date(earliest.getTime() - 24 * 60 * 60 * 1000));
    const byPositionId = new Map(history.map((t) => [String(t.positionId), t]));

    for (const pos of vanished) {
      const trade = byPositionId.get(pos.positionId!);
      if (!trade) {
        // Gone from the open list but not yet in history (settlement lag) —
        // leave OPEN, the next poll will pick it up.
        await logBotEvent(
          mode,
          "ERROR",
          `position ${pos.positionId} left the open list but isn't in trade history yet`,
          { symbol: pos.symbol }
        );
        continue;
      }

      const closeReason = inferCloseReason(pos.direction, trade.closeRate, pos.takeProfitRate);
      await prisma.botPosition.update({
        where: { id: pos.id },
        data: {
          status: "CLOSED",
          realizedPnl: trade.netProfit,
          closeRate: trade.closeRate,
          closeReason,
          closedAt: new Date(trade.closeTimestamp),
          // History is authoritative for the entry too, in case the fill was never observed.
          entryPrice: pos.entryPrice ?? trade.openRate,
          units: pos.units ?? trade.units,
        },
      });
      closed++;
      await logBotEvent(
        mode,
        "POSITION_CLOSED",
        `${pos.symbol} ${pos.direction} closed (${closeReason}): P&L ${trade.netProfit.toFixed(2)} at ${trade.closeRate}`,
        { symbol: pos.symbol, payload: trade }
      );
    }
  }

  const stillPending = await prisma.botPosition.count({ where: { mode, status: "PENDING" } });
  const openCount = await prisma.botPosition.count({ where: { mode, status: "OPEN" } });

  await logBotEvent(
    mode,
    "POLL",
    `reconciled: ${openCount} open, ${stillPending} pending, ${filled} filled, ${closed} closed, ${failed} failed`,
    { payload: { etoroOpenPositions: portfolio.positions.length } }
  );

  return { portfolio, filled, closed, failed, stillPending, open: openCount };
}

async function resolvePendingOrder(
  mode: EtoroMode,
  pos: BotPosition
): Promise<"filled" | "failed" | "pending"> {
  if (!pos.orderId) {
    await prisma.botPosition.update({
      where: { id: pos.id },
      data: { status: "FAILED", error: "no order id recorded" },
    });
    return "failed";
  }

  const info = await getOrderInfo(mode, pos.orderId);

  if (info.errorCode) {
    await prisma.botPosition.update({
      where: { id: pos.id },
      data: { status: "FAILED", error: `eToro error ${info.errorCode}: ${info.errorMessage ?? ""}` },
    });
    await logBotEvent(mode, "ORDER_REJECTED", `order ${pos.orderId} rejected by eToro`, {
      symbol: pos.symbol,
      payload: info,
    });
    return "failed";
  }

  const execution = info.positions?.find((p) => p.isOpen) ?? info.positions?.[0];
  if (!execution) {
    if (Date.now() - pos.openedAt.getTime() > PENDING_STALE_MS) {
      await prisma.botPosition.update({
        where: { id: pos.id },
        data: { status: "FAILED", error: "order never filled (stale after 7 days)" },
      });
      return "failed";
    }
    return "pending"; // queued for the next market open
  }

  const entryPrice = execution.rate;
  const direction = pos.direction as "LONG" | "SHORT";
  const exactTp = takeProfitRateFor(direction, entryPrice);

  // The order's TP was estimated from the signal close; re-anchor it to the
  // actual fill so the 2.5% target is measured from the real entry price.
  let takeProfitRate = pos.takeProfitRate ?? exactTp;
  if (
    pos.takeProfitRate == null ||
    Math.abs(exactTp - pos.takeProfitRate) / entryPrice > TP_DRIFT_TOLERANCE
  ) {
    try {
      await updatePositionTakeProfit(mode, String(execution.positionID), exactTp);
      takeProfitRate = exactTp;
    } catch (err) {
      await logBotEvent(
        mode,
        "ERROR",
        `failed to re-anchor TP on ${pos.symbol} to ${exactTp}: ${(err as Error).message}`,
        { symbol: pos.symbol }
      );
    }
  }

  await prisma.botPosition.update({
    where: { id: pos.id },
    data: {
      status: "OPEN",
      positionId: String(execution.positionID),
      entryPrice,
      units: execution.units,
      takeProfitRate,
      filledAt: new Date(execution.occurred),
    },
  });
  await logBotEvent(
    mode,
    "ORDER_FILLED",
    `${pos.symbol} ${pos.direction} filled at ${entryPrice}, TP ${takeProfitRate}`,
    { symbol: pos.symbol, payload: info }
  );
  return "filled";
}

function inferCloseReason(
  direction: string,
  closeRate: number,
  takeProfitRate: number | null
): string {
  if (takeProfitRate == null || !closeRate) return "unknown";
  const hit =
    direction === "LONG"
      ? closeRate >= takeProfitRate * (1 - TP_HIT_TOLERANCE)
      : closeRate <= takeProfitRate * (1 + TP_HIT_TOLERANCE);
  return hit ? "take-profit" : "manual";
}
