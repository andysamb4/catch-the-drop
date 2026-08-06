// Free, no-key historical daily closes for the Yo-Yo Hunter's on-demand 12-month lookback.
// (Stooq's CSV endpoint is now behind a JS bot-check that a server-side fetch can't pass —
// Yahoo's public chart API is the keyless fallback.) Used only for this one interactive
// screen, never the nightly cron, so it doesn't compete with Finnhub's rate limit.
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export type DailyClose = { date: string; close: number };

export type VixSnapshot = { level: number; changePct: number };

// Latest (possibly still-live) level vs the prior daily bar, via the keyless
// chart API. Shared by the VIX read and the overnight futures tape.
async function getChangeSnapshot(symbol: string): Promise<VixSnapshot | null> {
  const res = await fetch(
    `${YAHOO_BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      // A hung upstream would otherwise burn the whole cron function budget.
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const closes: Array<number | null> | undefined =
    data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  const valid = (closes ?? []).filter((c): c is number => c != null);
  if (valid.length < 2) return null;

  const level = valid[valid.length - 1];
  const prev = valid[valid.length - 2];
  return { level, changePct: ((level - prev) / prev) * 100 };
}

// ^VIX via the same keyless chart API (Finnhub's free tier has no index data).
// Used to put a "how scared is the market actually" number next to a
// market-alert headline.
export async function getVixSnapshot(): Promise<VixSnapshot | null> {
  return getChangeSnapshot("^VIX");
}

// CME futures trade nearly round the clock, so during the London/pre-US
// morning the last bar is the live overnight session — the same "futures are
// up X%" read a pre-market column opens with. Oil rides along as the
// geopolitics/risk-sentiment barometer. Each leg fails independently to null.
export type OvernightTape = {
  spFuturesPct: number | null;
  nasdaqFuturesPct: number | null;
  oilPct: number | null;
};

export async function getOvernightTape(): Promise<OvernightTape> {
  const [sp, nasdaq, oil] = await Promise.all([
    getChangeSnapshot("ES=F"),
    getChangeSnapshot("NQ=F"),
    getChangeSnapshot("CL=F"),
  ]);
  return {
    spFuturesPct: sp?.changePct ?? null,
    nasdaqFuturesPct: nasdaq?.changePct ?? null,
    oilPct: oil?.changePct ?? null,
  };
}

// Full daily OHLCV, oldest -> newest, for symbols with no eToro instrument ID.
// Those tickers otherwise only ever get today's Finnhub /quote, so a single bad
// day leaves a permanent hole in their history; this is the backfill that heals
// it. Prices are the raw traded values (indicators.quote, not adjclose) to match
// what the Finnhub quote path stores for the same symbol.
export type DailyBar = {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export async function getDailyBars(symbol: string, windowDays: number): Promise<DailyBar[] | null> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.ceil(windowDays * 1.6) * 24 * 60 * 60;

  const res = await fetch(
    `${YAHOO_BASE}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      // A hung upstream would otherwise burn the whole cron function budget.
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  const timestamps: number[] | undefined = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) return null;

  const bars: DailyBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const { open, high, low, close, volume } = {
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i],
    };
    // Yahoo pads holidays/halts with null rows; a bar is only usable if it has a
    // full OHLC set.
    if (open == null || high == null || low == null || close == null) continue;
    bars.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: volume ?? null,
    });
  }
  return bars;
}

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
