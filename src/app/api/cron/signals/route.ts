import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getQuote } from "@/lib/finnhub";
import { getDailyCandles } from "@/lib/etoro";
import { detectStreakSignal } from "@/lib/signals";
import { trendGate } from "@/lib/trend";
import { computeYoyoScore } from "@/lib/yoyo-score";
import { utcDateOnly } from "@/lib/date";
import { isTradingDay } from "@/lib/market-calendar";
import { findMissingTradingDays, barsAfterLastGap } from "@/lib/price-gaps";
import { backfillDailyBars } from "@/lib/price-history";
import { recordPriceGap, resolvePriceGaps } from "@/lib/notifications";
import { deriveStrategyFit } from "@/lib/strategy-fit";
import {
  executeSignalOrder,
  reconcilePositions,
  type SignalOrderOutcome,
} from "@/lib/auto-trade";
import { LONG_ONLY, getEtoroMode, strategyConfig } from "@/lib/trading-config";
import type { WatchlistItem } from "@/generated/prisma/client";

export const maxDuration = 300;

// eToro keeps serving candle history for delisted/halted instruments; without this
// guard a months-old streak would be re-emitted as a signal dated today.
const STALE_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
// Scanning ~95 tickers sequentially brushed against the function timeout and died
// partway with no trace. eToro's market-data quota is 120 req/min, so keep the
// concurrency modest: 6 workers finish the list in well under a minute.
const SCAN_CONCURRENCY = 6;
// detectStreakSignal needs a 3-day streak plus the bar before it. Below this the
// post-gap tail can't produce a signal, so there's nothing to fall back to.
const MIN_BARS_FOR_DETECTION = 4;

type TickerResult = {
  symbol: string;
  status: string;
  signal?: string;
  // Free-form note (e.g. which SMA the trend gate used, or why an etf-mr signal
  // was blocked) — surfaced in the run's JSON so the experiment is auditable.
  note?: string;
  // True when this run left an unfilled hole in the ticker's history. Everything
  // else is resolved at the end of the run, clearing stale gap notices.
  gapReported?: boolean;
  // Set when a signal was stored and the ticker is auto-tradeable (has an
  // eToro instrument ID) — consumed by the order-placement pass after the scan.
  tradeInput?: {
    signalId: string;
    instrumentId: number;
    type: "BUY";
    lastClose: number;
    strategy: string;
  };
};

async function scanTicker(
  ticker: WatchlistItem,
  minSignalMovePct: number,
  today: Date
): Promise<TickerResult> {
  // Strategy config decides how much history to fetch and whether the SMA trend
  // gate / longs-only rules apply. "core" tickers resolve to the champion config
  // (90-day window, no gate) so their behaviour is unchanged.
  const cfg = strategyConfig(ticker.strategy);

  // Series used for streak detection and yoyo scoring. For eToro tickers this is
  // the candle history exactly as eToro serves it; for Finnhub tickers it is
  // rebuilt from stored PriceBars below.
  let detectionBars: Array<{ close: number }>;
  // Free-form audit note (trend gate, gap fallback) returned with the result.
  let note: string | undefined;
  let gapReported = false;

  if (ticker.etoroInstrumentId) {
    // eToro path: full daily OHLCV history. createMany backfills any bars we
    // missed (gaps self-heal), the upsert refreshes the newest bar in case an
    // intraday snapshot of it was stored earlier the same day.
    const candles = await getDailyCandles(ticker.etoroInstrumentId, cfg.historyWindowDays);
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
    // Yahoo first: it serves the whole window, so any hole left by an earlier
    // failed run heals here (insert-only — today's bar stays the quote's job).
    const backfill = await backfillDailyBars(ticker.symbol, cfg.historyWindowDays).catch(
      () => ({ inserted: 0, upstreamDates: null })
    );

    const quote = await getQuote(ticker.symbol);
    if (!quote) {
      return { symbol: ticker.symbol, status: "no_quote" };
    }

    // Only on a real session. A manual weekend/holiday run would otherwise store
    // Friday's close again under today's date — a flat bar that breaks any streak
    // spanning it, for a day the market never traded.
    if (isTradingDay(today)) {
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
    }

    const recentBars = await prisma.priceBar.findMany({
      where: { symbol: ticker.symbol },
      orderBy: { date: "desc" },
      take: cfg.historyWindowDays,
    });
    // Drop bars stamped on non-trading days by earlier runs (see above) so their
    // duplicated closes can't reset a streak.
    const barsAsc = [...recentBars].reverse().filter((b) => isTradingDay(b.date));

    // Only count a missing day as a gap if the upstream series actually has it.
    // market-calendar models NYSE, so a day the instrument itself didn't trade
    // (thin ADRs, single-name halts) is absent upstream too and isn't our hole.
    const calendarGaps = findMissingTradingDays(barsAsc);
    const gaps = backfill.upstreamDates
      ? calendarGaps.filter((d) => backfill.upstreamDates!.has(d.toISOString().slice(0, 10)))
      : calendarGaps;

    if (gaps.length === 0) {
      detectionBars = barsAsc;
    } else {
      // Fall back to the unbroken run since the last hole rather than muting the
      // ticker: closes after a gap are still consecutive, so detection is sound
      // as soon as there are enough of them.
      const tail = barsAfterLastGap(barsAsc, gaps);
      const usable = tail.length >= MIN_BARS_FOR_DETECTION;
      gapReported = true;
      await recordPriceGap(
        ticker.symbol,
        gaps,
        usable
          ? `Detection ran on the ${tail.length} sessions since.`
          : `Only ${tail.length} session${tail.length === 1 ? "" : "s"} since — detection skipped until the history rebuilds.`
      );
      if (!usable) return { symbol: ticker.symbol, status: "data_gap", gapReported };
      detectionBars = tail;
      note = `gap fallback: ${tail.length} bars since ${gaps[gaps.length - 1].toISOString().slice(0, 10)}`;
    }
  }

  let signal = detectStreakSignal(detectionBars, minSignalMovePct);

  // Long-only (see LONG_ONLY): an up-streak is still detected — the same engine
  // backs the backtest, which can still simulate shorts — but it is dropped here,
  // before anything is written, so no new SHORT signal reaches the signals list,
  // the morning brief or the order pass. Existing SHORT rows are untouched.
  if (LONG_ONLY && signal?.type === "SHORT") {
    signal = null;
    note = "SHORT streak ignored (long-only)";
  }

  // For etf-mr, the streak is only a valid signal if it agrees with the long-SMA
  // trend (buy dips in uptrends). A blocked streak or one without enough history
  // to judge the trend produces no signal at all — so "etf-mr produces signals
  // only where the trend gate passes". core skips this.
  if (signal && cfg.trendFilter) {
    const gate = trendGate(
      detectionBars.map((b) => b.close),
      signal.type,
      cfg.smaPeriod,
      cfg.minTrendBars
    );
    if (!gate) {
      note = "trend-gate: insufficient history";
      signal = null;
    } else if (!gate.passed) {
      note = `trend-gate blocked ${signal.type} (SMA${gate.periodUsed})`;
      signal = null;
    } else {
      note = `trend-gate passed (SMA${gate.periodUsed})`;
    }
  }

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
        strategy: ticker.strategy,
      },
    });
    // Only eToro-mapped tickers are executable; Finnhub-only tickers stay
    // signal-only. The BUY check is the second half of the long-only rule: the
    // order pass can only ever be handed a long.
    if (ticker.etoroInstrumentId && signal.type === "BUY") {
      tradeInput = {
        signalId: signalRow.id,
        instrumentId: ticker.etoroInstrumentId,
        type: "BUY",
        lastClose: detectionBars[detectionBars.length - 1].close,
        strategy: ticker.strategy,
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

  return { symbol: ticker.symbol, status: "ok", signal: signal?.type, note, gapReported, tradeInput };
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

  // Clear gap notices for every ticker that came through this run whole — a
  // backfilled hole, or a ticker that moved to the eToro candle path. Otherwise
  // the home-page footnote keeps reporting holes that no longer exist.
  await resolvePriceGaps(
    results.filter((r) => r && !r.gapReported).map((r) => r.symbol)
  ).catch(() => {});

  // Auto-trade pass: place the $TRADE_SIZE_USD market order (TP attached) for
  // each executable signal. Sequential — a signal day yields a handful of
  // orders, and eToro's execution quota is far tighter than market-data's.
  const mode = getEtoroMode();
  // Reconcile first so fills and server-side TP closes from the session are
  // recorded before the one-position-per-symbol dedupe runs. Also matters for
  // cadence: Vercel Hobby caps crons at once daily, so this run doubles as a
  // second close-detection poll alongside trade-sync and sandbox refreshes.
  let reconcileError: string | undefined;
  await reconcilePositions(mode).catch((err) => {
    reconcileError = (err as Error).message;
  });
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
    ...(reconcileError && { reconcileError }),
    // tradeInput was plumbing for the order pass, not reporting — drop it
    results: results.map((r) => ({
      symbol: r.symbol,
      status: r.status,
      signal: r.signal,
      ...(r.note && { note: r.note }),
    })),
  });
}
