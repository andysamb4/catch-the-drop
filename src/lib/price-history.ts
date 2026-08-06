import { prisma } from "@/lib/db";
import { getDailyBars } from "@/lib/yahoo-finance";

export type BackfillResult = {
  inserted: number;
  // Every trading date the upstream series covers, or null when the fetch failed.
  // A calendar date the upstream itself doesn't have is a day the instrument
  // didn't trade — not a hole in our pipeline — so gap reporting filters against it.
  upstreamDates: Set<string> | null;
};

/**
 * Tops up PriceBar history for a Finnhub-only ticker (no eToro instrument ID)
 * from Yahoo's keyless chart API.
 *
 * Those tickers have no candle source, so the nightly cron builds their history
 * one /quote at a time — meaning one failed fetch leaves a hole that never heals
 * and, because streak detection refuses to run across a hole, silently mutes the
 * ticker forever. This makes that path self-healing the way the eToro one already
 * is: insert-only (skipDuplicates), so bars we already hold — including today's,
 * which the live quote owns — are never overwritten by a possibly-partial Yahoo row.
 */
export async function backfillDailyBars(
  symbol: string,
  windowDays: number
): Promise<BackfillResult> {
  const bars = await getDailyBars(symbol, windowDays).catch(() => null);
  if (!bars || bars.length === 0) return { inserted: 0, upstreamDates: null };

  const { count } = await prisma.priceBar.createMany({
    data: bars.map((b) => ({
      symbol,
      date: new Date(`${b.date}T00:00:00.000Z`),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume != null ? BigInt(Math.round(b.volume)) : null,
    })),
    skipDuplicates: true,
  });

  return { inserted: count, upstreamDates: new Set(bars.map((b) => b.date)) };
}
