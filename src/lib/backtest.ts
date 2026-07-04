import { detectStreakSignal } from "@/lib/signals";
import { calcRealizedPL } from "@/lib/trade-math";
import { nextTradingDay } from "@/lib/market-calendar";

export type BacktestBar = { date: string; close: number };

export type BacktestTickerInput = {
  symbol: string;
  name: string;
  sector: string | null;
  bars: BacktestBar[];
};

export type BacktestParams = {
  minStreakLength: number;
  holdingPeriodDays: number;
  minMovePct: number;
  positionSizeUsd: number;
};

export type BacktestTrade = {
  symbol: string;
  sector: string | null;
  direction: "LONG" | "SHORT";
  streakLength: number;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  quantity: number;
  realizedPL: number;
};

export type BacktestStats = {
  totalTrades: number;
  winRate: number | null;
  avgPLPerTrade: number | null;
  totalPL: number;
  equityCurve: Array<{ date: string; cumulative: number }>;
  byStreakLength: Array<{ streakLength: number; avgPL: number; trades: number }>;
  byDirection: Record<"LONG" | "SHORT", { count: number; winRate: number | null; avgPL: number | null }>;
};

// Detection only ever cares about the trailing run of same-direction days, so capping
// the lookback avoids an O(n^2) full-history diff pass on every simulated day while
// staying far above any realistic streak length.
const LOOKBACK_BARS = 60;

// Splits bars (ascending) into runs with no missing trading days, so a streak or holding
// period is never computed across a hole in the self-built history (see price-gaps.ts).
function splitIntoContiguousSegments(bars: BacktestBar[]): BacktestBar[][] {
  const segments: BacktestBar[][] = [];
  let current: BacktestBar[] = [];

  for (const bar of bars) {
    if (current.length > 0) {
      const prevDate = new Date(current[current.length - 1].date);
      const expected = nextTradingDay(prevDate);
      if (expected.getTime() !== new Date(bar.date).getTime()) {
        segments.push(current);
        current = [];
      }
    }
    current.push(bar);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Replays the live 3-day-streak rule (via detectStreakSignal) forward through each
 * ticker's self-built price history. One open position per ticker at a time — a fresh
 * signal while a trade is still held is skipped, not stacked. A trade is only recorded
 * if the full holding period completes within a gap-free segment; otherwise it's dropped
 * as incomplete rather than guessed at.
 */
export function runBacktest(
  tickers: BacktestTickerInput[],
  params: BacktestParams
): BacktestTrade[] {
  const { minStreakLength, holdingPeriodDays, minMovePct, positionSizeUsd } = params;
  const trades: BacktestTrade[] = [];

  for (const ticker of tickers) {
    for (const segment of splitIntoContiguousSegments(ticker.bars)) {
      let heldUntil = -1;

      for (let i = minStreakLength; i < segment.length; i++) {
        if (i <= heldUntil) continue;

        const window = segment.slice(Math.max(0, i + 1 - LOOKBACK_BARS), i + 1);
        const signal = detectStreakSignal(window, minMovePct, minStreakLength);
        if (!signal) continue;

        const exitIndex = i + holdingPeriodDays;
        if (exitIndex >= segment.length) continue;

        const entryPrice = segment[i].close;
        const exitPrice = segment[exitIndex].close;
        const quantity = entryPrice > 0 ? Math.floor(positionSizeUsd / entryPrice) : 0;
        if (quantity <= 0) continue;

        const direction = signal.type === "BUY" ? "LONG" : "SHORT";
        const realizedPL = calcRealizedPL(direction, entryPrice, exitPrice, quantity);

        trades.push({
          symbol: ticker.symbol,
          sector: ticker.sector,
          direction,
          streakLength: signal.streakLength,
          entryDate: segment[i].date,
          entryPrice,
          exitDate: segment[exitIndex].date,
          exitPrice,
          quantity,
          realizedPL,
        });

        heldUntil = exitIndex;
      }
    }
  }

  return trades;
}

export function computeBacktestStats(trades: BacktestTrade[]): BacktestStats {
  const totalTrades = trades.length;
  const totalPL = trades.reduce((sum, t) => sum + t.realizedPL, 0);
  const winRate = totalTrades ? (trades.filter((t) => t.realizedPL > 0).length / totalTrades) * 100 : null;
  const avgPLPerTrade = totalTrades ? totalPL / totalTrades : null;

  const sortedByExit = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  let cumulative = 0;
  const equityCurve = sortedByExit.map((t) => {
    cumulative += t.realizedPL;
    return { date: t.exitDate, cumulative };
  });

  const streakMap = new Map<number, { total: number; trades: number }>();
  for (const t of trades) {
    const entry = streakMap.get(t.streakLength) ?? { total: 0, trades: 0 };
    entry.total += t.realizedPL;
    entry.trades += 1;
    streakMap.set(t.streakLength, entry);
  }
  const byStreakLength = Array.from(streakMap.entries())
    .map(([streakLength, v]) => ({ streakLength, avgPL: v.total / v.trades, trades: v.trades }))
    .sort((a, b) => a.streakLength - b.streakLength);

  const byDirection = {
    LONG: directionStats(trades, "LONG"),
    SHORT: directionStats(trades, "SHORT"),
  };

  return { totalTrades, winRate, avgPLPerTrade, totalPL, equityCurve, byStreakLength, byDirection };
}

function directionStats(trades: BacktestTrade[], direction: "LONG" | "SHORT") {
  const subset = trades.filter((t) => t.direction === direction);
  const winRate = subset.length ? (subset.filter((t) => t.realizedPL > 0).length / subset.length) * 100 : null;
  const avgPL = subset.length ? subset.reduce((sum, t) => sum + t.realizedPL, 0) / subset.length : null;
  return { count: subset.length, winRate, avgPL };
}
