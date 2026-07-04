import { nextTradingDay } from "./market-calendar";

export type PriceGapBar = { date: Date };

/**
 * bars must be sorted ascending by date. Returns the trading-day dates that fall
 * between the earliest and latest bar but have no bar of their own — e.g. a missed
 * or failed cron run. Streak detection over a range with a gap silently treats
 * non-adjacent trading days as adjacent, so callers should skip signal emission
 * when this returns anything.
 */
export function findMissingTradingDays(bars: PriceGapBar[]): Date[] {
  const missing: Date[] = [];
  for (let i = 1; i < bars.length; i++) {
    let expected = nextTradingDay(bars[i - 1].date);
    while (expected.getTime() < bars[i].date.getTime()) {
      missing.push(expected);
      expected = nextTradingDay(expected);
    }
  }
  return missing;
}
