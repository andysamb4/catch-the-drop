import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getQuote } from "@/lib/finnhub";
import { getDailyCandles } from "@/lib/etoro";
import { detectStreakSignal } from "@/lib/signals";
import { computeYoyoScore } from "@/lib/yoyo-score";
import { utcDateOnly } from "@/lib/date";
import { findMissingTradingDays } from "@/lib/price-gaps";
import { recordPriceGap } from "@/lib/notifications";
import { deriveStrategyFit } from "@/lib/strategy-fit";

export const maxDuration = 60;

const HISTORY_WINDOW_DAYS = 90;
// eToro keeps serving candle history for delisted/halted instruments; without this
// guard a months-old streak would be re-emitted as a signal dated today.
const STALE_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tickers, settings] = await Promise.all([
    prisma.watchlistItem.findMany({ where: { active: true } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  const minSignalMovePct = settings?.minSignalMovePct ?? 3.0;
  const today = utcDateOnly();
  const results: Array<{ symbol: string; status: string; signal?: string }> = [];

  for (const ticker of tickers) {
    try {
      // Series used for streak detection and yoyo scoring. For eToro tickers this is
      // the candle history exactly as eToro serves it; for Finnhub tickers it is
      // rebuilt from stored PriceBars below.
      let detectionBars: Array<{ close: number }>;

      if (ticker.etoroInstrumentId) {
        // eToro path: full daily OHLCV history. createMany backfills any bars we
        // missed (gaps self-heal), the upsert refreshes the newest bar in case an
        // intraday snapshot of it was stored earlier the same day.
        const candles = await getDailyCandles(ticker.etoroInstrumentId, HISTORY_WINDOW_DAYS);
        if (candles.length === 0) {
          results.push({ symbol: ticker.symbol, status: "no_candles" });
          continue;
        }
        const bars = candles.map((c) => ({
          symbol: ticker.symbol,
          date: new Date(c.fromDate),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume != null ? BigInt(Math.round(c.volume)) : null,
        }));
        const latest = bars[bars.length - 1];
        await prisma.priceBar.createMany({ data: bars, skipDuplicates: true });
        await prisma.priceBar.upsert({
          where: { symbol_date: { symbol: ticker.symbol, date: latest.date } },
          update: {
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            volume: latest.volume,
          },
          create: latest,
        });

        if (Date.now() - latest.date.getTime() > STALE_HISTORY_MS) {
          results.push({ symbol: ticker.symbol, status: "stale_history" });
          continue;
        }

        // No findMissingTradingDays here: market-calendar.ts models NYSE only, so
        // UK/EU/Asia holidays false-positive as gaps for non-US listings. eToro's
        // series is the trading-day sequence of the instrument's home exchange, and
        // detection runs on it exactly as fetched.
        detectionBars = bars;
      } else {
        // Finnhub fallback for manually added tickers with no eToro instrument ID.
        const quote = await getQuote(ticker.symbol);
        if (!quote) {
          results.push({ symbol: ticker.symbol, status: "no_quote" });
          continue;
        }

        await prisma.priceBar.upsert({
          where: { symbol_date: { symbol: ticker.symbol, date: today } },
          update: { open: quote.o, high: quote.h, low: quote.l, close: quote.c },
          create: {
            symbol: ticker.symbol,
            date: today,
            open: quote.o,
            high: quote.h,
            low: quote.l,
            close: quote.c,
          },
        });

        const recentBars = await prisma.priceBar.findMany({
          where: { symbol: ticker.symbol },
          orderBy: { date: "desc" },
          take: HISTORY_WINDOW_DAYS,
        });
        const barsAsc = [...recentBars].reverse();

        const gaps = findMissingTradingDays(barsAsc);
        if (gaps.length > 0) {
          await recordPriceGap(ticker.symbol, gaps);
          results.push({ symbol: ticker.symbol, status: "data_gap" });
          continue;
        }
        detectionBars = barsAsc;
      }

      const signal = detectStreakSignal(detectionBars, minSignalMovePct);
      if (signal) {
        await prisma.signal.upsert({
          where: { symbol_date_type: { symbol: ticker.symbol, date: today, type: signal.type } },
          update: {},
          create: {
            symbol: ticker.symbol,
            date: today,
            type: signal.type,
            streakLength: signal.streakLength,
            cumulativeMovePct: signal.cumulativeMovePct,
          },
        });
      }

      const yoyoScore = computeYoyoScore(detectionBars.map((b) => b.close));
      await prisma.watchlistItem.update({
        where: { symbol: ticker.symbol },
        data: {
          yoyoScore,
          yoyoScoreAt: new Date(),
          // A manual override in the watchlist edit form sticks until cleared —
          // don't let the nightly recompute silently overwrite it.
          ...(ticker.strategyFitManual
            ? {}
            : { strategyFit: deriveStrategyFit(yoyoScore, detectionBars.length) }),
        },
      });

      results.push({ symbol: ticker.symbol, status: "ok", signal: signal?.type });
    } catch (err) {
      results.push({ symbol: ticker.symbol, status: `error: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
