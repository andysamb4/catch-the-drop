export type StreakBar = { close: number };

export type StreakSignal = {
  type: "BUY" | "SHORT";
  streakLength: number;
  cumulativeMovePct: number;
};

/**
 * bars must be ordered oldest -> newest. Detects a run of consecutive same-direction
 * closes ending at the most recent bar: 3+ down days => BUY, 3+ up days => SHORT.
 * Returns null if the streak is shorter than 3 days or its cumulative move doesn't
 * clear minMovePct (filters out noise like a 3-day drop on 0.3% moves).
 */
export function detectStreakSignal(bars: StreakBar[], minMovePct: number): StreakSignal | null {
  if (bars.length < 4) return null;

  const diffs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    diffs.push(bars[i].close - bars[i - 1].close);
  }

  const lastSign = Math.sign(diffs[diffs.length - 1]);
  if (lastSign === 0) return null;

  let streak = 0;
  for (let i = diffs.length - 1; i >= 0 && Math.sign(diffs[i]) === lastSign; i--) {
    streak++;
  }
  if (streak < 3) return null;

  const streakStartClose = bars[bars.length - 1 - streak].close;
  const streakEndClose = bars[bars.length - 1].close;
  const cumulativeMovePct = ((streakEndClose - streakStartClose) / streakStartClose) * 100;

  if (Math.abs(cumulativeMovePct) < minMovePct) return null;

  return {
    type: lastSign < 0 ? "BUY" : "SHORT",
    streakLength: streak,
    cumulativeMovePct,
  };
}
