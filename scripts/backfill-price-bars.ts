/**
 * Repairs PriceBar history for tickers with no eToro instrument ID.
 *
 * Those tickers only ever received today's Finnhub /quote, so any run that
 * failed for them (2026-08-04 hit all 22 at once) left a hole that never healed
 * and blocked streak detection indefinitely. The nightly scan now backfills from
 * Yahoo on every run; this script does the same sweep on demand — useful after
 * an outage, or to check history without waiting for the cron.
 *
 *   NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env scripts/backfill-price-bars.ts
 *   ... --dry-run            report gaps, write nothing
 *   ... --symbols=PFE,AMC    limit to specific tickers
 */
import { prisma } from "../src/lib/db";
import { backfillDailyBars } from "../src/lib/price-history";
import { findMissingTradingDays } from "../src/lib/price-gaps";
import { isTradingDay } from "../src/lib/market-calendar";
import { resolvePriceGaps } from "../src/lib/notifications";
import { strategyConfig } from "../src/lib/trading-config";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args
  .find((a) => a.startsWith("--symbols="))
  ?.slice("--symbols=".length)
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function gapsFor(symbol: string, windowDays: number) {
  const bars = await prisma.priceBar.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    take: windowDays,
    select: { date: true },
  });
  // Non-trading-day bars are artefacts of manual weekend runs; detection ignores
  // them now, so the gap walk must ignore them too.
  const asc = [...bars].reverse().filter((b) => isTradingDay(b.date));
  return { bars: asc, gaps: findMissingTradingDays(asc) };
}

async function main() {
  const tickers = await prisma.watchlistItem.findMany({
    where: {
      active: true,
      etoroInstrumentId: null,
      ...(only ? { symbol: { in: only } } : {}),
    },
    select: { symbol: true, strategy: true },
  });
  console.log(`${tickers.length} Finnhub-only tickers${dryRun ? " (dry run)" : ""}\n`);

  let repaired = 0;
  let stillBroken = 0;

  for (const t of tickers) {
    const windowDays = strategyConfig(t.strategy).historyWindowDays;
    const before = await gapsFor(t.symbol, windowDays);
    if (before.gaps.length === 0) {
      if (!dryRun) await resolvePriceGaps([t.symbol]);
      console.log(`${t.symbol.padEnd(6)} ok (${before.bars.length} bars)`);
      continue;
    }

    if (dryRun) {
      console.log(`${t.symbol.padEnd(6)} gaps: ${before.gaps.map(iso).join(", ")}`);
      continue;
    }

    const { inserted, upstreamDates } = await backfillDailyBars(t.symbol, windowDays);
    const after = await gapsFor(t.symbol, windowDays);
    // A date the upstream doesn't carry either is a day the instrument didn't
    // trade, not a hole — don't count it as unrepaired.
    const unfilled = upstreamDates
      ? after.gaps.filter((d) => upstreamDates.has(iso(d)))
      : after.gaps;

    if (unfilled.length === 0) {
      repaired++;
      await resolvePriceGaps([t.symbol]);
      console.log(
        `${t.symbol.padEnd(6)} repaired: +${inserted} bars, filled ${before.gaps.map(iso).join(", ")}`
      );
    } else {
      stillBroken++;
      console.log(
        `${t.symbol.padEnd(6)} STILL MISSING ${unfilled.map(iso).join(", ")} (+${inserted} bars)`
      );
    }
  }

  console.log(`\nrepaired: ${repaired}, still broken: ${stillBroken}`);
}

main().finally(() => prisma.$disconnect());
