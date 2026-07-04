import type { StrategyFit } from "@/generated/prisma/client";

// Below this many bars, a yo-yo score isn't meaningful yet — a freshly added
// ticker with 3 days of history shouldn't be labeled POOR just for lack of data.
export const MIN_BARS_FOR_STRATEGY_FIT = 20;

const GOOD_THRESHOLD = 6;
const MODERATE_THRESHOLD = 3;

/**
 * Maps the ZigZag(2%) yo-yo score (see yoyo-score.ts) to a strategy-fit bucket.
 * Higher reversal count = more two-sided chop = better fit for this
 * mean-reversion (3-day drop/climb) strategy; low/zero = trending, poor fit.
 */
export function deriveStrategyFit(yoyoScore: number, barCount: number): StrategyFit | null {
  if (barCount < MIN_BARS_FOR_STRATEGY_FIT) return null;
  if (yoyoScore >= GOOD_THRESHOLD) return "GOOD";
  if (yoyoScore >= MODERATE_THRESHOLD) return "MODERATE";
  return "POOR";
}
