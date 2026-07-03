const FINNHUB_BASE = "https://finnhub.io/api/v1";

// Finnhub's free tier no longer includes /stock/candle (historical OHLC) — that's paid-only now.
// /quote is still free and gives today's o/h/l/c, so the app builds its own history one day at a time.
export type FinnhubQuote = {
  c: number; // current price (= today's close once the market has closed)
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // quote timestamp (unix seconds)
};

export async function getQuote(symbol: string): Promise<FinnhubQuote | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");

  const res = await fetch(
    `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
    { cache: "no-store" }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as Partial<FinnhubQuote>;
  // Finnhub returns all-zero fields (rather than an error) for unknown/delisted symbols.
  if (!data || typeof data.c !== "number" || data.c === 0) return null;

  return data as FinnhubQuote;
}
