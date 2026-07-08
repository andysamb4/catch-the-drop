export const CHAT_SYSTEM_PROMPT = `You are the trading assistant inside "3-Day Drop & Climb," a personal app that tracks a stock watchlist for 3-consecutive-day drop (BUY) and 3-consecutive-day climb (SHORT) signals, and logs the user's manually-executed eToro trades.

You have tools to look up the user's watchlist, signals, trades, and accumulated price history. Use them whenever a question depends on current data — never guess numbers.

Be concise and specific; lead with the number or verdict, then the reasoning. This is not financial advice, and you should say so if the user seems to be asking you to make a final call rather than reason about the strategy's own data.`;

export function morningBriefPrompt(signal: {
  symbol: string;
  name: string;
  type: "BUY" | "SHORT";
  streakLength: number;
  cumulativeMovePct: number;
  marketContext?: string;
}) {
  return `Write one short paragraph (2-3 sentences, no headers) of commentary on this fresh signal for a personal trading journal:

Ticker: ${signal.symbol} (${signal.name})
Signal: ${signal.type} after a ${signal.streakLength}-day streak, ${signal.cumulativeMovePct.toFixed(1)}% cumulative move.

The strategy is mean-reversion: BUY signals bet on a bounce after a drop, SHORT signals bet on a pullback after a climb. Comment on whether this move looks like plausible mean-reversion noise or a sign of a stronger trend that could work against the bet. Do not repeat the raw numbers back verbatim — add perspective.${
    signal.marketContext
      ? `

Overnight market alert: ${signal.marketContext}
Weigh whether this streak is stock-specific or part of the market-wide move. If the whole market is being driven by this event, the drop/climb carries no ${signal.symbol}-specific information to revert — the bet becomes a macro bet with fatter tails, and the commentary should temper conviction accordingly (smaller size or waiting a day are valid middle answers).`
      : ""
  }`;
}

export function marketAlertPrompt(params: {
  headlines: Array<{ headline: string; source: string }>;
  vix: { level: number; changePct: number } | null;
}) {
  const vixLine = params.vix
    ? `\nCurrent VIX: ${params.vix.level.toFixed(1)} (${params.vix.changePct >= 0 ? "+" : ""}${params.vix.changePct.toFixed(1)}% vs prior close).`
    : "";
  const list = params.headlines.map((h) => `- [${h.source}] ${h.headline}`).join("\n");

  return `You are a strict severity filter for overnight financial news. Below are market headlines from roughly the last 18 hours.${vixLine}

Decide whether anything here is MAJOR: an event likely to move the whole equity market on the order of 1% or more today. Examples: war or serious military escalation involving a major power, a surprise central-bank action or rate shock, a sovereign default or systemic credit event, a market crash or circuit-breaker halt, a major-power trade rupture.

Routine market chatter is NOT major: daily "stocks rise/fall as investors weigh X" filler, single-company earnings or analyst calls, ordinary Fed commentary, modest commodity or currency moves, political noise with no market transmission. Most days have no major event. When in doubt, answer none.

Reply with JSON only, no code fences, in exactly one of these shapes:
{"alert": null}
{"alert": {"headline": "<one-line warning, max 12 words>", "body": "<1-2 sentences: what happened and why it matters for today's session>"}}

Headlines:
${list}`;
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
