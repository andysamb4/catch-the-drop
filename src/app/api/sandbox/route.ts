import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reconcilePositions } from "@/lib/auto-trade";
import { getInstrumentInfo } from "@/lib/etoro";
import type { LivePortfolio } from "@/lib/etoro-execution";
import {
  STOP_LOSS_PCT,
  TAKE_PROFIT_PCT,
  TRADE_SIZE_USD,
  getEtoroMode,
  isAutoTradeEnabled,
} from "@/lib/trading-config";

export const maxDuration = 120;

// The sandbox page's data source. MODE IS HARD-PINNED TO DEMO — this route
// never reads ETORO_MODE, so whatever the global bot is doing, everything
// fetched or reconciled here touches only eToro's virtual-money environment.
const SANDBOX_MODE = "demo" as const;

export async function GET() {
  // Every fetch doubles as a poll: reconcile first so fills and server-side
  // take-profit closes are recorded before the snapshot is read.
  let portfolio: LivePortfolio | null = null;
  let etoroError: string | null = null;
  try {
    ({ portfolio } = await reconcilePositions(SANDBOX_MODE));
  } catch (err) {
    etoroError = (err as Error).message;
  }

  const [botPositions, events, lastPoll] = await Promise.all([
    prisma.botPosition.findMany({
      where: { mode: SANDBOX_MODE },
      orderBy: { openedAt: "desc" },
      take: 100,
    }),
    prisma.botEvent.findMany({
      where: { mode: SANDBOX_MODE },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.botEvent.findFirst({
      where: { mode: SANDBOX_MODE, type: "POLL" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const botByPositionId = new Map(
    botPositions.filter((p) => p.positionId).map((p) => [p.positionId!, p])
  );

  // Resolve instrument IDs to tickers for demo positions the bot didn't open.
  let instrumentInfo = new Map<number, { symbol: string; name: string }>();
  if (portfolio && portfolio.positions.length > 0) {
    try {
      instrumentInfo = await getInstrumentInfo(portfolio.positions.map((p) => p.instrumentID));
    } catch {
      // Non-fatal: fall back to bot records / raw instrument IDs below.
    }
  }

  const openPositions = (portfolio?.positions ?? []).map((p) => {
    const bot = botByPositionId.get(String(p.positionID));
    const info = instrumentInfo.get(p.instrumentID);
    return {
      positionId: String(p.positionID),
      symbol: bot?.symbol ?? info?.symbol ?? `#${p.instrumentID}`,
      name: info?.name ?? "",
      direction: p.isBuy ? "LONG" : "SHORT",
      investedUsd: p.initialAmountInDollars ?? p.amount,
      entryPrice: p.openRate,
      takeProfitRate: p.takeProfitRate ?? bot?.takeProfitRate ?? null,
      currentRate: p.unrealizedPnL?.closeRate ?? null,
      unrealizedPnl: p.unrealizedPnL?.pnL ?? null,
      openedAt: p.openDateTime,
      isBot: bot != null,
    };
  });

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    etoroError,
    account: portfolio
      ? {
          cash: portfolio.credit,
          invested: openPositions.reduce((sum, p) => sum + (p.investedUsd ?? 0), 0),
          unrealizedPnl: portfolio.unrealizedPnL,
        }
      : null,
    openPositions,
    pendingOrders: botPositions
      .filter((p) => p.status === "PENDING")
      .map((p) => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        requestedUsd: p.requestedUsd,
        takeProfitRate: p.takeProfitRate,
        placedAt: p.openedAt,
      })),
    closedPositions: botPositions
      .filter((p) => p.status === "CLOSED")
      .map((p) => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        investedUsd: p.requestedUsd,
        entryPrice: p.entryPrice,
        closeRate: p.closeRate,
        realizedPnl: p.realizedPnl,
        closeReason: p.closeReason,
        closedAt: p.closedAt,
      })),
    failedOrders: botPositions
      .filter((p) => p.status === "FAILED")
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        error: p.error,
        placedAt: p.openedAt,
      })),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      symbol: e.symbol,
      message: e.message,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
    status: {
      running: isAutoTradeEnabled(),
      globalMode: getEtoroMode(),
      lastPollAt: lastPoll?.createdAt ?? null,
      etoroReachable: etoroError === null,
    },
    config: {
      tradeSizeUsd: TRADE_SIZE_USD,
      takeProfitPct: TAKE_PROFIT_PCT,
      stopLossPct: STOP_LOSS_PCT ?? null,
    },
  });
}
