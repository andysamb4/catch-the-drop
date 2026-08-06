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

/**
 * The unbroken run of bars after the last hole — the series streak detection can
 * still trust when a gap couldn't be backfilled.
 *
 * A gap only corrupts closes that span it: everything after the last missing day
 * is genuinely consecutive. Detection needs a handful of those to see a streak,
 * so a stale one-day hole costs at most a few days of coverage for that ticker
 * instead of muting it indefinitely. Returns the whole array when there are no gaps.
 */
export function barsAfterLastGap<T extends PriceGapBar>(bars: T[], gaps: Date[]): T[] {
  if (gaps.length === 0) return bars;
  const lastGap = gaps[gaps.length - 1].getTime();
  return bars.filter((b) => b.date.getTime() > lastGap);
}
