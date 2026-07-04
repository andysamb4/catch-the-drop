// Free, no-key historical daily closes for the Yo-Yo Hunter's on-demand 12-month lookback.
// (Stooq's CSV endpoint is now behind a JS bot-check that a server-side fetch can't pass —
// Yahoo's public chart API is the keyless fallback.) Used only for this one interactive
// screen, never the nightly cron, so it doesn't compete with Finnhub's rate limit.
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export type DailyClose = { date: string; close: number };

export async function getYearOfDailyCloses(symbol: string): Promise<DailyClose[] | null> {
  const res = await fetch(
    `${YAHOO_BASE}/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
  );
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  const timestamps: number[] | undefined = result?.timestamp;
  const closes: Array<number | null> | undefined = result?.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) return null;

  const bars: DailyClose[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    bars.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: closes[i] as number });
  }
  return bars;
}
