import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getQuote } from "@/lib/finnhub";
import { detectStreakSignal } from "@/lib/signals";
import { computeYoyoScore } from "@/lib/yoyo-score";
import { utcDateOnly } from "@/lib/date";
import { findMissingTradingDays } from "@/lib/price-gaps";
import { recordPriceGap } from "@/lib/notifications";
import { deriveStrategyFit } from "@/lib/strategy-fit";

export const maxDuration = 60;

const HISTORY_WINDOW_DAYS = 90;

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

      const signal = detectStreakSignal(barsAsc, minSignalMovePct);
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

      const yoyoScore = computeYoyoScore(barsAsc.map((b) => b.close));
      await prisma.watchlistItem.update({
        where: { symbol: ticker.symbol },
        data: {
          yoyoScore,
          yoyoScoreAt: new Date(),
          // A manual override in the watchlist edit form sticks until cleared —
          // don't let the nightly recompute silently overwrite it.
          ...(ticker.strategyFitManual
            ? {}
            : { strategyFit: deriveStrategyFit(yoyoScore, barsAsc.length) }),
        },
      });

      results.push({ symbol: ticker.symbol, status: "ok", signal: signal?.type });
    } catch (err) {
      results.push({ symbol: ticker.symbol, status: `error: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
