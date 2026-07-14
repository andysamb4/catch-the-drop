import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStrategySummary, reconcilePositions } from "@/lib/auto-trade";
import { getInstrumentInfo } from "@/lib/etoro";
import type { LivePortfolio } from "@/lib/etoro-execution";
import {
  BOT_BANKROLL_USD,
  BOT_MAX_POSITIONS,
  KNOWN_STRATEGIES,
  SHORT_STOP_LOSS_PCT,
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

  const [botPositions, events, lastPoll, strategies] = await Promise.all([
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
    // Champion vs challenger scorecards — one per known strategy, all demo-scoped.
    Promise.all(KNOWN_STRATEGIES.map((s) => getStrategySummary(SANDBOX_MODE, s))),
  ]);

  const botByPositionId = new Map(
    botPositions.filter((p) => p.positionId).map((p) => [p.positionId!, p])
  );

  // Legacy demo positions (opened outside the bot) are ignored everywhere on
  // this page — the balance cards and the positions table are bot-only, so the
  // account's old manual trades can't drown out the strategies under test.
  const botLive = (portfolio?.positions ?? []).filter((p) =>
    botByPositionId.has(String(p.positionID))
  );

  // Resolve instrument IDs to company names for display.
  let instrumentInfo = new Map<number, { symbol: string; name: string }>();
  if (botLive.length > 0) {
    try {
      instrumentInfo = await getInstrumentInfo(botLive.map((p) => p.instrumentID));
    } catch {
      // Non-fatal: rows fall back to the bot record's symbol with no name.
    }
  }

  const openPositions = botLive.map((p) => {
    const bot = botByPositionId.get(String(p.positionID))!;
    const info = instrumentInfo.get(p.instrumentID);
    return {
      positionId: String(p.positionID),
      symbol: bot.symbol,
      name: info?.name ?? "",
      direction: p.isBuy ? "LONG" : "SHORT",
      investedUsd: p.initialAmountInDollars ?? p.amount,
      entryPrice: p.openRate,
      takeProfitRate: p.takeProfitRate ?? bot.takeProfitRate ?? null,
      currentRate: p.unrealizedPnL?.closeRate ?? null,
      unrealizedPnl: p.unrealizedPnL?.pnL ?? null,
      openedAt: p.openDateTime,
      strategy: bot.strategy,
    };
  });

  const invested = openPositions.reduce((sum, p) => sum + (p.investedUsd ?? 0), 0);
  const unrealizedPnl = openPositions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
  // Pool equity is realized-only (bankroll + booked P&L); adding open P&L gives
  // the mark-to-market figure for the header. Null when a strategy runs fixed
  // sizing (bankrollUsd = 0) — there's no equity notion to sum in that case.
  const poolEquity = strategies.every((s) => s.equity != null)
    ? strategies.reduce((sum, s) => sum + (s.equity ?? 0), 0)
    : null;

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    etoroError,
    account: portfolio
      ? {
          equity: poolEquity == null ? null : poolEquity + unrealizedPnl,
          invested,
          unrealizedPnl,
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
        strategy: p.strategy,
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
        strategy: p.strategy,
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
        strategy: p.strategy,
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
    // Per-strategy scorecards (champion "core" vs challenger "etf-mr"), demo-scoped.
    strategies,
    config: {
      tradeSizeUsd: TRADE_SIZE_USD,
      bankrollUsd: BOT_BANKROLL_USD > 0 ? BOT_BANKROLL_USD : null,
      maxPositions: BOT_MAX_POSITIONS,
      takeProfitPct: TAKE_PROFIT_PCT,
      stopLossPct: STOP_LOSS_PCT ?? null,
      shortStopLossPct: SHORT_STOP_LOSS_PCT,
    },
  });
}
