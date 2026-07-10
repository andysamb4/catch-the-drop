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
import { executeSignalOrder, type SignalOrderOutcome } from "@/lib/auto-trade";
import { getEtoroMode } from "@/lib/trading-config";
import type { WatchlistItem } from "@/generated/prisma/client";

export const maxDuration = 300;

const HISTORY_WINDOW_DAYS = 90;
// eToro keeps serving candle history for delisted/halted instruments; without this
// guard a months-old streak would be re-emitted as a signal dated today.
const STALE_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
// Scanning ~95 tickers sequentially brushed against the function timeout and died
// partway with no trace. eToro's market-data quota is 120 req/min, so keep the
// concurrency modest: 6 workers finish the list in well under a minute.
const SCAN_CONCURRENCY = 6;

type TickerResult = {
  symbol: string;
  status: string;
  signal?: string;
  // Set when a signal was stored and the ticker is auto-tradeable (has an
  // eToro instrument ID) — consumed by the order-placement pass after the scan.
  tradeInput?: {
    signalId: string;
    instrumentId: number;
    type: "BUY" | "SHORT";
    lastClose: number;
  };
};

async function scanTicker(
  ticker: WatchlistItem,
  minSignalMovePct: number,
  today: Date
): Promise<TickerResult> {
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
      return { symbol: ticker.symbol, status: "no_candles" };
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
      return { symbol: ticker.symbol, status: "stale_history" };
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
      return { symbol: ticker.symbol, status: "no_quote" };
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
      return { symbol: ticker.symbol, status: "data_gap" };
    }
    detectionBars = barsAsc;
  }

  const signal = detectStreakSignal(detectionBars, minSignalMovePct);
  let tradeInput: TickerResult["tradeInput"];
  if (signal) {
    const signalRow = await prisma.signal.upsert({
      where: { symbol_date_type: { symbol: ticker.symbol, date: today, type: signal.type } },
      // A manual daytime run may have stamped today's row from a partial intraday
      // candle; the close-based nightly run must overwrite those numbers.
      update: {
        streakLength: signal.streakLength,
        cumulativeMovePct: signal.cumulativeMovePct,
      },
      create: {
        symbol: ticker.symbol,
        date: today,
        type: signal.type,
        streakLength: signal.streakLength,
        cumulativeMovePct: signal.cumulativeMovePct,
      },
    });
    // Only eToro-mapped tickers are executable; Finnhub-only tickers stay signal-only.
    if (ticker.etoroInstrumentId) {
      tradeInput = {
        signalId: signalRow.id,
        instrumentId: ticker.etoroInstrumentId,
        type: signal.type,
        lastClose: detectionBars[detectionBars.length - 1].close,
      };
    }
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

  return { symbol: ticker.symbol, status: "ok", signal: signal?.type, tradeInput };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const [tickers, settings] = await Promise.all([
    prisma.watchlistItem.findMany({ where: { active: true } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  const minSignalMovePct = settings?.minSignalMovePct ?? 3.0;
  const today = utcDateOnly();
  const results: TickerResult[] = new Array(tickers.length);

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tickers.length) {
      const idx = nextIndex++;
      const ticker = tickers[idx];
      try {
        results[idx] = await scanTicker(ticker, minSignalMovePct, today);
      } catch (err) {
        results[idx] = { symbol: ticker.symbol, status: `error: ${(err as Error).message}` };
      }
      // Every attempt counts as "scanned", including skips and errors — the home
      // page flags tickers whose lastScannedAt lags the rest as missed by the run.
      await prisma.watchlistItem
        .update({ where: { symbol: ticker.symbol }, data: { lastScannedAt: new Date() } })
        .catch(() => {});
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, tickers.length) }, () => worker())
  );

  const signalCount = results.filter((r) => r.signal).length;
  const errorCount = results.filter((r) => r.status.startsWith("error")).length;

  // Auto-trade pass: place the $TRADE_SIZE_USD market order (TP attached) for
  // each executable signal. Sequential — a signal day yields a handful of
  // orders, and eToro's execution quota is far tighter than market-data's.
  const mode = getEtoroMode();
  const orders: SignalOrderOutcome[] = [];
  for (const r of results) {
    if (!r.tradeInput) continue;
    try {
      orders.push(
        await executeSignalOrder(mode, { symbol: r.symbol, ...r.tradeInput })
      );
    } catch (err) {
      orders.push({ symbol: r.symbol, outcome: "failed", detail: (err as Error).message });
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    total: tickers.length,
    signalCount,
    errorCount,
    tradingMode: mode,
    ordersPlaced: orders.filter((o) => o.outcome === "placed").length,
    orders,
    // tradeInput was plumbing for the order pass, not reporting — drop it
    results: results.map((r) => ({ symbol: r.symbol, status: r.status, signal: r.signal })),
  });
}
