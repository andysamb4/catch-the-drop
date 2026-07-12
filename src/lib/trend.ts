// Long-SMA trend gate for the ETF mean-reversion challenger. Mean reversion pays
// best when you buy dips inside an uptrend and fade rallies inside a downtrend,
// so a raw 3-day-down BUY is only kept when price sits ABOVE its long SMA, and a
// 3-day-up SHORT only when price sits BELOW it. This is the key experimental
// variable — it keeps the challenger out of things dropping because they're dying.

export type TrendGate = {
  passed: boolean;
  sma: number;
  // The SMA length actually used — may be shorter than requested when the
  // instrument's history is short (recorded so a run notes which was applied).
  periodUsed: number;
};

// closes must be ordered oldest -> newest. Returns null when there isn't enough
// history to judge the trend (fewer than minPeriod bars), signalling the caller
// to emit no signal rather than trade blind.
export function trendGate(
  closes: number[],
  type: "BUY" | "SHORT",
  requestedPeriod: number,
  minPeriod: number
): TrendGate | null {
  const available = closes.length;
  const periodUsed = Math.min(requestedPeriod, available);
  if (periodUsed < minPeriod || periodUsed <= 0) return null;

  const window = closes.slice(available - periodUsed);
  const sma = window.reduce((sum, c) => sum + c, 0) / periodUsed;
  const lastClose = closes[available - 1];
  const passed = type === "BUY" ? lastClose > sma : lastClose < sma;

  return { passed, sma, periodUsed };
}
