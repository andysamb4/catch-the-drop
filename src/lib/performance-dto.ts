import type { TradeDTO } from "@/lib/trade-dto";

export type PerformanceStats = {
  closedCount: number;
  openCount: number;
  winRate: number | null; // 0-100
  avgPLPerTrade: number | null;
  avgHoldingDays: number | null;
  totalRealizedPL: number;
  bestTickers: Array<{ symbol: string; totalPL: number; trades: number }>;
  worstTickers: Array<{ symbol: string; totalPL: number; trades: number }>;
  byDirection: Record<"LONG" | "SHORT", { count: number; winRate: number | null; avgPL: number | null }>;
  byStreakLength: Array<{ streakLength: number; avgPL: number; trades: number }>;
  equityCurve: Array<{ date: string; cumulative: number }>;
  monthlyPL: Array<{ month: string; total: number }>;
};

export function computePerformanceStats(trades: TradeDTO[]): PerformanceStats {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.realizedPL != null && t.exitDate);
  const open = trades.filter((t) => t.status === "OPEN");

  const totalRealizedPL = closed.reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);
  const winRate = closed.length ? (closed.filter((t) => (t.realizedPL ?? 0) > 0).length / closed.length) * 100 : null;
  const avgPLPerTrade = closed.length ? totalRealizedPL / closed.length : null;
  const avgHoldingDays = closed.length
    ? closed.reduce((sum, t) => sum + (t.holdingDays ?? 0), 0) / closed.length
    : null;

  const bySymbol = new Map<string, { totalPL: number; trades: number }>();
  for (const t of closed) {
    const entry = bySymbol.get(t.symbol) ?? { totalPL: 0, trades: 0 };
    entry.totalPL += t.realizedPL ?? 0;
    entry.trades += 1;
    bySymbol.set(t.symbol, entry);
  }
  const bySymbolArr = Array.from(bySymbol.entries()).map(([symbol, v]) => ({ symbol, ...v }));
  const bestTickers = [...bySymbolArr].sort((a, b) => b.totalPL - a.totalPL).slice(0, 5);
  const worstTickers = [...bySymbolArr].sort((a, b) => a.totalPL - b.totalPL).slice(0, 5);

  const byDirection = {
    LONG: directionStats(closed, "LONG"),
    SHORT: directionStats(closed, "SHORT"),
  };

  const streakMap = new Map<number, { total: number; trades: number }>();
  for (const t of closed) {
    if (t.signalStreakLength == null) continue;
    const entry = streakMap.get(t.signalStreakLength) ?? { total: 0, trades: 0 };
    entry.total += t.realizedPL ?? 0;
    entry.trades += 1;
    streakMap.set(t.signalStreakLength, entry);
  }
  const byStreakLength = Array.from(streakMap.entries())
    .map(([streakLength, v]) => ({ streakLength, avgPL: v.total / v.trades, trades: v.trades }))
    .sort((a, b) => a.streakLength - b.streakLength);

  const sortedByExit = [...closed].sort((a, b) => (a.exitDate ?? "").localeCompare(b.exitDate ?? ""));
  let cumulative = 0;
  const equityCurve = sortedByExit.map((t) => {
    cumulative += t.realizedPL ?? 0;
    return { date: t.exitDate as string, cumulative };
  });

  const monthlyMap = new Map<string, number>();
  for (const t of sortedByExit) {
    const month = (t.exitDate as string).slice(0, 7); // YYYY-MM
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + (t.realizedPL ?? 0));
  }
  const monthlyPL = Array.from(monthlyMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    closedCount: closed.length,
    openCount: open.length,
    winRate,
    avgPLPerTrade,
    avgHoldingDays,
    totalRealizedPL,
    bestTickers,
    worstTickers,
    byDirection,
    byStreakLength,
    equityCurve,
    monthlyPL,
  };
}

function directionStats(closed: TradeDTO[], direction: "LONG" | "SHORT") {
  const subset = closed.filter((t) => t.direction === direction);
  const winRate = subset.length
    ? (subset.filter((t) => (t.realizedPL ?? 0) > 0).length / subset.length) * 100
    : null;
  const avgPL = subset.length
    ? subset.reduce((sum, t) => sum + (t.realizedPL ?? 0), 0) / subset.length
    : null;
  return { count: subset.length, winRate, avgPL };
}
