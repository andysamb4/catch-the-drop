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

// Cash size of each bot trade, in USD.
export const TRADE_SIZE_USD = envNumber("TRADE_SIZE_USD", 100);

// Take-profit distance as a fraction of the entry price. Attached to every
// order via eToro's native takeProfitRate so the close happens server-side.
export const TAKE_PROFIT_PCT = envNumber("TAKE_PROFIT_PCT", 0.025);

// Optional stop-loss hook, disabled by default. Set STOP_LOSS_PCT (e.g. 0.05)
// to attach a stopLossRate to new orders — no other code change needed.
export const STOP_LOSS_PCT: number | undefined = process.env.STOP_LOSS_PCT
  ? envNumber("STOP_LOSS_PCT", 0) || undefined
  : undefined;

// Sandbox page auto-refresh interval (2 hours).
export const SANDBOX_REFRESH_MS = envNumber("SANDBOX_REFRESH_MS", 7_200_000);

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

// Stop-loss mirrors take-profit on the unfavourable side; returns undefined
// while STOP_LOSS_PCT is unset so order payloads omit the field entirely.
export function stopLossRateFor(
  direction: "LONG" | "SHORT",
  entryRate: number
): number | undefined {
  if (STOP_LOSS_PCT === undefined) return undefined;
  const factor = direction === "LONG" ? 1 - STOP_LOSS_PCT : 1 + STOP_LOSS_PCT;
  return roundRate(entryRate * factor);
}
