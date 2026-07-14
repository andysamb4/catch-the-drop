// Auto-trading configuration. Every knob is an env var with a safe default;
// the defaults keep the bot pointed at eToro's demo (virtual-money) environment.

export type EtoroMode = "demo" | "real";

// Only the exact string "real" selects live trading — any other value
// (unset, typo, casing slip) falls back to demo.
export function getEtoroMode(): EtoroMode {
  return process.env.ETORO_MODE === "real" ? "real" : "demo";
}

// Second, independent flag required for real-money orders. A single mistyped
// env var can flip ETORO_MODE, but it cannot also spell out ETORO_ALLOW_REAL=true,
// so no lone typo can point the bot at real funds.
export function isRealTradingAllowed(): boolean {
  return process.env.ETORO_ALLOW_REAL === "true";
}

// Kill switch for order placement. Reconciliation/monitoring keeps running
// when disabled — only new orders stop.
export function isAutoTradeEnabled(): boolean {
  return process.env.AUTO_TRADE !== "false";
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Unset/empty => fallback; only the exact string "true"/"false" flips it.
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return raw === "true";
}

// Fixed cash size of each bot trade, in USD. Only used when bankroll sizing
// is disabled (BOT_BANKROLL_USD=0).
export const TRADE_SIZE_USD = envNumber("TRADE_SIZE_USD", 100);

// Bankroll sizing (the default): the bot manages a virtual bankroll, splits it
// across BOT_MAX_POSITIONS concurrent slots, and sizes each trade at
// equity / slots where equity = bankroll + realized bot P&L. Wins therefore
// compound into larger trades; open positions (including stuck bags) lock
// their capital and shrink what's deployable. Set BOT_BANKROLL_USD=0 to fall
// back to fixed TRADE_SIZE_USD sizing.
export const BOT_BANKROLL_USD = process.env.BOT_BANKROLL_USD === "0"
  ? 0
  : envNumber("BOT_BANKROLL_USD", 5000);
export const BOT_MAX_POSITIONS = envNumber("BOT_MAX_POSITIONS", 10);

// Skip a signal rather than place a dust-sized order when the bankroll is
// nearly fully deployed (eToro's own floor is $10/position).
export const MIN_TRADE_USD = envNumber("MIN_TRADE_USD", 50);

// Take-profit distance as a fraction of the entry price. Attached to every
// order via eToro's native takeProfitRate so the close happens server-side.
export const TAKE_PROFIT_PCT = envNumber("TAKE_PROFIT_PCT", 0.025);

// Optional stop-loss hook, disabled by default. Set STOP_LOSS_PCT (e.g. 0.05)
// to attach a stopLossRate to new orders — no other code change needed.
export const STOP_LOSS_PCT: number | undefined = process.env.STOP_LOSS_PCT
  ? envNumber("STOP_LOSS_PCT", 0) || undefined
  : undefined;

// eToro refuses to open a short without a stop-loss ("StopLossRate must be
// provided … for SellShort transactions"), so shorts can never ride bare the
// way longs do. When STOP_LOSS_PCT is unset, SHORT orders fall back to this
// wide emergency stop; the take-profit remains the intended exit.
export const SHORT_STOP_LOSS_PCT = envNumber("SHORT_STOP_LOSS_PCT", 0.1);

// Sandbox page auto-refresh interval (2 hours).
export const SANDBOX_REFRESH_MS = envNumber("SANDBOX_REFRESH_MS", 7_200_000);

// --- Strategy segregation -------------------------------------------------
// "core" is the champion: the original single-stock streak bot, whose behaviour
// must stay byte-for-byte unchanged. "etf-mr" is the challenger: the same streak
// engine over a liquid ETF universe, gated by a long-SMA trend filter and run on
// an isolated compounding bankroll so the two can be compared cleanly. Both run
// on eToro demo — strategy is orthogonal to mode (demo/real), which is why it is
// a separate field rather than an overload of mode.

export type Strategy = "core" | "etf-mr";
export const CORE_STRATEGY: Strategy = "core";
export const ETF_MR_STRATEGY: Strategy = "etf-mr";
// Order matters for reporting: champion first, then challenger.
export const KNOWN_STRATEGIES: readonly Strategy[] = [CORE_STRATEGY, ETF_MR_STRATEGY];

export type StrategyConfig = {
  strategy: Strategy;
  label: string;
  // Compounding bankroll base in USD. 0 => fixed TRADE_SIZE_USD sizing.
  bankrollUsd: number;
  maxPositions: number;
  // Daily bars to fetch for detection. The trend filter needs a long lookback,
  // so etf-mr pulls far more history than core's 90.
  historyWindowDays: number;
  // Long-SMA trend gate: BUY only when price is above its SMA, SHORT only when
  // below. Keeps the challenger buying dips inside uptrends, not falling knives.
  trendFilter: boolean;
  smaPeriod: number;
  // Don't apply the trend gate with fewer than this many bars — fall back is to
  // treat the ticker as having insufficient history and emit no signal.
  minTrendBars: number;
  // Record SHORT signals for observation but never place SHORT orders. The short
  // side of mean reversion is the dangerous half, so the challenger starts long-only.
  longsOnly: boolean;
};

// etf-mr challenger knobs — all optional env with safe defaults. Its bankroll is
// independent of core's BOT_BANKROLL_USD so the experiment never draws from the
// champion's capital.
const ETF_MR_BANKROLL_USD =
  process.env.ETF_MR_BANKROLL_USD === "0" ? 0 : envNumber("ETF_MR_BANKROLL_USD", 5000);
const ETF_MR_MAX_POSITIONS = envNumber("ETF_MR_MAX_POSITIONS", 10);
const ETF_MR_HISTORY_WINDOW_DAYS = envNumber("ETF_MR_HISTORY_WINDOW_DAYS", 260);
const ETF_MR_SMA_PERIOD = envNumber("ETF_MR_SMA_PERIOD", 200);
const ETF_MR_MIN_TREND_BARS = envNumber("ETF_MR_MIN_TREND_BARS", 50);
const ETF_MR_LONGS_ONLY = envBool("ETF_MR_LONGS_ONLY", true);

// Resolve a (possibly unknown) strategy string to its config. Anything that
// isn't "etf-mr" maps to the core champion config, so a stray value can never
// silently enable the experimental gates.
export function strategyConfig(strategy: string): StrategyConfig {
  if (strategy === ETF_MR_STRATEGY) {
    return {
      strategy: ETF_MR_STRATEGY,
      label: "ETF Drop & Climb",
      bankrollUsd: ETF_MR_BANKROLL_USD,
      maxPositions: ETF_MR_MAX_POSITIONS,
      historyWindowDays: ETF_MR_HISTORY_WINDOW_DAYS,
      trendFilter: true,
      smaPeriod: ETF_MR_SMA_PERIOD,
      minTrendBars: ETF_MR_MIN_TREND_BARS,
      longsOnly: ETF_MR_LONGS_ONLY,
    };
  }
  return {
    strategy: CORE_STRATEGY,
    label: "Single-stock streak",
    bankrollUsd: BOT_BANKROLL_USD,
    maxPositions: BOT_MAX_POSITIONS,
    // The champion's historical fetch window — unchanged.
    historyWindowDays: 90,
    trendFilter: false,
    smaPeriod: 0,
    minTrendBars: 0,
    longsOnly: false,
  };
}

// eToro rejects rates with excess precision; 4 decimals is fine-grained enough
// for sub-$10 instruments while staying within accepted tick formats.
export function roundRate(rate: number): number {
  return Math.round(rate * 10_000) / 10_000;
}

// Long: TP above entry. Short: TP below entry.
export function takeProfitRateFor(direction: "LONG" | "SHORT", entryRate: number): number {
  const factor = direction === "LONG" ? 1 + TAKE_PROFIT_PCT : 1 - TAKE_PROFIT_PCT;
  return roundRate(entryRate * factor);
}

// Stop-loss mirrors take-profit on the unfavourable side. Longs may omit it
// (undefined while STOP_LOSS_PCT is unset, so the payload drops the field),
// but shorts always get one — eToro rejects sellShort orders without it.
export function stopLossRateFor(
  direction: "LONG" | "SHORT",
  entryRate: number
): number | undefined {
  if (direction === "LONG") {
    if (STOP_LOSS_PCT === undefined) return undefined;
    return roundRate(entryRate * (1 - STOP_LOSS_PCT));
  }
  return roundRate(entryRate * (1 + (STOP_LOSS_PCT ?? SHORT_STOP_LOSS_PCT)));
}
