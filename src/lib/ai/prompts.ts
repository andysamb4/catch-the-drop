export const CHAT_SYSTEM_PROMPT = `You are the trading assistant inside "3-Day Drop & Climb," a personal app that tracks a stock watchlist for 3-consecutive-day drop (BUY) and 3-consecutive-day climb (SHORT) signals, and logs the user's manually-executed eToro trades.

You have tools to look up the user's watchlist, signals, trades, and accumulated price history. Use them whenever a question depends on current data — never guess numbers.

Be concise and specific; lead with the number or verdict, then the reasoning. This is not financial advice, and you should say so if the user seems to be asking you to make a final call rather than reason about the strategy's own data.`;

export function morningBriefPrompt(signal: {
  symbol: string;
  name: string;
  type: "BUY" | "SHORT";
  streakLength: number;
  cumulativeMovePct: number;
}) {
  return `Write one short paragraph (2-3 sentences, no headers) of commentary on this fresh signal for a personal trading journal:

Ticker: ${signal.symbol} (${signal.name})
Signal: ${signal.type} after a ${signal.streakLength}-day streak, ${signal.cumulativeMovePct.toFixed(1)}% cumulative move.

The strategy is mean-reversion: BUY signals bet on a bounce after a drop, SHORT signals bet on a pullback after a climb. Comment on whether this move looks like plausible mean-reversion noise or a sign of a stronger trend that could work against the bet. Do not repeat the raw numbers back verbatim — add perspective.`;
}

export function yoyoHunterPrompt(params: {
  symbol: string;
  yoyoScore: number;
  months: number;
  cumulativeReturnPct: number;
}) {
  return `Analyze whether ${params.symbol} fits a 3-day mean-reversion (drop-then-bounce / climb-then-pullback) strategy, based on ${params.months} months of daily closes.

Computed yo-yo score (count of >2% zigzag reversals over the period): ${params.yoyoScore}.
Cumulative return over the period: ${params.cumulativeReturnPct.toFixed(1)}%.

Give a verdict in the first sentence (fits well / fits moderately / poor fit), then 2-3 sentences of reasoning. A high yo-yo score with a roughly flat cumulative return suggests genuine range-bound oscillation (good fit). A high yo-yo score alongside a large cumulative return suggests a volatile but trending stock (poor fit for this specific strategy, since streaks may just be a trend continuing, not reverting).`;
}
