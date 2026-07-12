import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getAllInstruments } from "../src/lib/etoro";

// Seeds the ETF mean-reversion challenger universe as WatchlistItem rows tagged
// strategy = "etf-mr". Two things this handles that the regular eToro sync can't:
//   1. Resolution: the sync only imports symbols already on the user's eToro
//      watchlists. Here we resolve every ETF symbol against eToro's full
//      instrument catalogue and populate etoroInstrumentId directly — the natural
//      "is it tradeable on eToro?" gate. Symbols eToro doesn't list are dropped.
//   2. Isolation: existing rows (e.g. a "core" SPY/QQQ already in the watchlist)
//      are never touched — a symbol belongs to exactly one strategy, so a
//      collision is reported and skipped, leaving the champion untouched.
//
// Run: NODE_OPTIONS=--use-system-ca npx tsx prisma/seed-etf-mr.ts [--tiers=1,2]
// Default is tier 1 only (the HIGH-suitability names); add tiers as the
// challenger proves out.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED });
const prisma = new PrismaClient({ adapter });

const ETF_MR = "etf-mr";

// Symbols that already exist as "core" rows but should move to the challenger.
// SPY & QQQ are the flagship mean-reversion ETFs mis-filed in the single-stock
// bot (and carry no eToro instrument ID, so the champion isn't trading them);
// reassigning also populates their resolved instrument ID. Every other existing
// symbol (e.g. VOO) is left untouched.
const REASSIGN_TO_ETF_MR = new Set(["SPY", "QQQ"]);

type EtfSeed = { symbol: string; sector: string; tier: number };

// Tier 1 — HIGH suitability (seed first).
const TIER1: Record<string, string[]> = {
  "US Equity": ["SPY", "VOO", "IVV", "VTI", "QQQ", "DIA", "IWM", "IWB", "IWD", "IWF", "RSP", "MDY", "IJH", "IJR", "VTV", "VUG"],
  "US Factor/Dividend": ["SCHD", "VYM", "VIG", "NOBL", "QUAL", "VLUE"],
  Sector: ["XLK", "XLF", "XLV", "XLI", "XLY", "XLP", "XLU", "XLC"],
  "International Equity": ["EFA", "IEFA", "VEA", "VXUS", "ACWI", "VGK"],
};

// Tier 2 — MEDIUM (add after tier 1 works).
const TIER2: Record<string, string[]> = {
  "US Factor/Dividend": ["DVY", "USMV", "SPLV"],
  Sector: ["XLE", "XLB", "XLRE", "SMH", "SOXX", "KRE", "KBE", "ITB", "XHB", "XRT"],
  "Real Estate": ["IYR", "VNQ"],
  "International Equity": ["EZU", "EEM", "IEMG", "VWO", "EWJ", "EWG", "EWU", "EWC", "EWA", "INDA"],
  Bonds: ["AGG", "BND", "TLT", "IEF", "LQD", "HYG", "JNK", "EMB", "GOVT", "VCIT"],
  Commodity: ["GLD", "IAU"],
};

// Tier 3 — LOWER / experimental thematic names (opt-in; these trend hard).
const TIER3: Record<string, string[]> = {
  Thematic: ["ARKK", "KWEB", "TAN", "GDX", "USO"],
};

function flatten(map: Record<string, string[]>, tier: number): EtfSeed[] {
  return Object.entries(map).flatMap(([sector, symbols]) =>
    symbols.map((symbol) => ({ symbol, sector, tier }))
  );
}

function parseTiers(): number[] {
  const arg = process.argv.find((a) => a.startsWith("--tiers="))?.split("=")[1] ?? process.env.ETF_MR_SEED_TIERS;
  if (!arg) return [1];
  return arg
    .split(",")
    .map((t) => Number(t.trim()))
    .filter((t) => t >= 1 && t <= 3);
}

async function main() {
  const tiers = parseTiers();
  const universe: EtfSeed[] = [
    ...(tiers.includes(1) ? flatten(TIER1, 1) : []),
    ...(tiers.includes(2) ? flatten(TIER2, 2) : []),
    ...(tiers.includes(3) ? flatten(TIER3, 3) : []),
  ];
  console.log(`Seeding etf-mr tiers [${tiers.join(", ")}] — ${universe.length} candidate symbols.\n`);

  // Resolve symbols against eToro's full catalogue (one call, ~15k rows).
  const instruments = await getAllInstruments();
  const bySymbol = new Map<string, (typeof instruments)[number]>();
  for (const inst of instruments) {
    const key = (inst.symbolFull || "").toUpperCase();
    if (key && !bySymbol.has(key)) bySymbol.set(key, inst);
  }
  console.log(`Fetched ${instruments.length} eToro instruments.\n`);

  const seeded: string[] = [];
  const reassigned: string[] = [];
  const skippedExisting: string[] = [];
  const droppedUnmapped: string[] = [];

  for (const etf of universe) {
    const inst = bySymbol.get(etf.symbol.toUpperCase());
    if (!inst) {
      droppedUnmapped.push(etf.symbol);
      continue;
    }

    const existing = await prisma.watchlistItem.findUnique({ where: { symbol: etf.symbol } });
    if (existing) {
      if (REASSIGN_TO_ETF_MR.has(etf.symbol) && existing.strategy !== ETF_MR) {
        await prisma.watchlistItem.update({
          where: { symbol: etf.symbol },
          data: {
            strategy: ETF_MR,
            active: true,
            sector: etf.sector,
            // Backfill the instrument ID so the challenger can actually trade it.
            etoroInstrumentId: existing.etoroInstrumentId ?? inst.instrumentID,
            notes: `ETF mean-reversion challenger (tier ${etf.tier}, reassigned from core). eToro instrument ${inst.instrumentID}.`,
          },
        });
        reassigned.push(`${etf.symbol} (core -> etf-mr, id ${existing.etoroInstrumentId ?? inst.instrumentID})`);
      } else {
        // Never repurpose any other existing row — a "core" VOO stays core.
        skippedExisting.push(`${etf.symbol} (already ${existing.strategy})`);
      }
      continue;
    }

    await prisma.watchlistItem.create({
      data: {
        symbol: etf.symbol,
        name: inst.instrumentDisplayName || etf.symbol,
        sector: etf.sector,
        active: true,
        strategy: ETF_MR,
        etoroInstrumentId: inst.instrumentID,
        notes: `ETF mean-reversion challenger (tier ${etf.tier}). eToro instrument ${inst.instrumentID}.`,
      },
    });
    seeded.push(`${etf.symbol} -> ${inst.instrumentID}`);
  }

  console.log(`\n=== Seed summary ===`);
  console.log(`Seeded new (${seeded.length}): ${seeded.join(", ") || "none"}`);
  console.log(`\nReassigned from core (${reassigned.length}): ${reassigned.join(", ") || "none"}`);
  console.log(`\nSkipped, already present (${skippedExisting.length}): ${skippedExisting.join(", ") || "none"}`);
  console.log(`\nDropped, not on eToro (${droppedUnmapped.length}): ${droppedUnmapped.join(", ") || "none"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
