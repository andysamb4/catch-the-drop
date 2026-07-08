import { prisma } from "@/lib/db";
import type { Signal, StrategyFit, WatchlistItem } from "@/generated/prisma/client";

export type SignalDTO = {
  id: string;
  symbol: string;
  name: string;
  date: string;
  type: "BUY" | "SHORT";
  streakLength: number;
  cumulativeMovePct: number;
  aiCommentary: string | null;
  createdAt: string;
  priceAtSignal: number | null;
  suggestedShares: number | null;
  strategyFit: StrategyFit | null;
  // Last <=5 closes ending on the signal date, for the card sparkline.
  sparkline: number[] | null;
};

type SignalWithTicker = Signal & { watchlistItem: WatchlistItem };

const SPARKLINE_POINTS = 5;
// Calendar-day buffer wide enough to cover 5 trading days across weekends and holidays.
const SPARKLINE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

async function withSizing(signals: SignalWithTicker[]): Promise<SignalDTO[]> {
  if (signals.length === 0) return [];

  const times = signals.map((s) => s.date.getTime());
  const [settings, bars] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.priceBar.findMany({
      where: {
        symbol: { in: Array.from(new Set(signals.map((s) => s.symbol))) },
        date: { gte: new Date(Math.min(...times) - SPARKLINE_LOOKBACK_MS), lte: new Date(Math.max(...times)) },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const positionSizeUsd = settings?.positionSizeUsd ?? 500;
  const barsBySymbol = new Map<string, typeof bars>();
  for (const bar of bars) {
    const list = barsBySymbol.get(bar.symbol);
    if (list) list.push(bar);
    else barsBySymbol.set(bar.symbol, [bar]);
  }

  return signals.map((s) => {
    const upToSignal = (barsBySymbol.get(s.symbol) ?? []).filter(
      (b) => b.date.getTime() <= s.date.getTime()
    );
    const signalBar = upToSignal.find((b) => b.date.getTime() === s.date.getTime());
    const price = signalBar?.close ?? null;
    const sparkline = upToSignal.slice(-SPARKLINE_POINTS).map((b) => b.close);
    return {
      id: s.id,
      symbol: s.symbol,
      name: s.watchlistItem.name,
      date: s.date.toISOString(),
      type: s.type,
      streakLength: s.streakLength,
      cumulativeMovePct: s.cumulativeMovePct,
      aiCommentary: s.aiCommentary,
      createdAt: s.createdAt.toISOString(),
      priceAtSignal: price,
      suggestedShares: price ? Math.floor(positionSizeUsd / price) : null,
      strategyFit: s.watchlistItem.strategyFit,
      sparkline: sparkline.length >= 2 ? sparkline : null,
    };
  });
}

// "Today's" signals really means "the most recent scan's signals" — the nightly cron
// runs late (21:05 UTC), so a literal calendar-date filter would show nothing all
// morning until that evening's run, right when the morning brief most needs data.
export async function getLatestSignals(): Promise<SignalDTO[]> {
  const latest = await prisma.signal.findFirst({ orderBy: { date: "desc" } });
  if (!latest) return [];

  const signals = await prisma.signal.findMany({
    where: { date: latest.date },
    include: { watchlistItem: true },
    orderBy: { createdAt: "desc" },
  });
  return withSizing(signals);
}

export async function getAllSignals(): Promise<SignalDTO[]> {
  const signals = await prisma.signal.findMany({
    include: { watchlistItem: true },
    orderBy: { date: "desc" },
  });
  return withSizing(signals);
}
