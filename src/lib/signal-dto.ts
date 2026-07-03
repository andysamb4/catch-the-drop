import { prisma } from "@/lib/db";
import { utcDateOnly } from "@/lib/date";
import type { Signal, WatchlistItem } from "@/generated/prisma/client";

export type SignalDTO = {
  id: string;
  symbol: string;
  name: string;
  date: string;
  type: "BUY" | "SHORT";
  streakLength: number;
  cumulativeMovePct: number;
  createdAt: string;
  priceAtSignal: number | null;
  suggestedShares: number | null;
};

type SignalWithTicker = Signal & { watchlistItem: WatchlistItem };

async function withSizing(signals: SignalWithTicker[]): Promise<SignalDTO[]> {
  if (signals.length === 0) return [];

  const [settings, bars] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.priceBar.findMany({
      where: { OR: signals.map((s) => ({ symbol: s.symbol, date: s.date })) },
    }),
  ]);

  const positionSizeUsd = settings?.positionSizeUsd ?? 500;
  const barMap = new Map(bars.map((b) => [`${b.symbol}|${b.date.toISOString()}`, b]));

  return signals.map((s) => {
    const bar = barMap.get(`${s.symbol}|${s.date.toISOString()}`);
    const price = bar?.close ?? null;
    return {
      id: s.id,
      symbol: s.symbol,
      name: s.watchlistItem.name,
      date: s.date.toISOString(),
      type: s.type,
      streakLength: s.streakLength,
      cumulativeMovePct: s.cumulativeMovePct,
      createdAt: s.createdAt.toISOString(),
      priceAtSignal: price,
      suggestedShares: price ? Math.floor(positionSizeUsd / price) : null,
    };
  });
}

export async function getTodaysSignals(): Promise<SignalDTO[]> {
  const today = utcDateOnly();
  const signals = await prisma.signal.findMany({
    where: { date: today },
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
