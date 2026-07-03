import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED });
const prisma = new PrismaClient({ adapter });

// Suggested starter watchlist: known volatile / "yo-yo" names, from the original build brief.
const STARTER_WATCHLIST = [
  { symbol: "GME", name: "GameStop Corp.", sector: "Retail" },
  { symbol: "AMC", name: "AMC Entertainment Holdings", sector: "Entertainment" },
  { symbol: "PLTR", name: "Palantir Technologies", sector: "Software" },
  { symbol: "RIVN", name: "Rivian Automotive", sector: "Automotive" },
  { symbol: "LCID", name: "Lucid Group", sector: "Automotive" },
  { symbol: "COIN", name: "Coinbase Global", sector: "Financial Services" },
  { symbol: "SOFI", name: "SoFi Technologies", sector: "Financial Services" },
  { symbol: "HOOD", name: "Robinhood Markets", sector: "Financial Services" },
  { symbol: "MARA", name: "MARA Holdings", sector: "Crypto Mining" },
  { symbol: "RIOT", name: "Riot Platforms", sector: "Crypto Mining" },
  { symbol: "TSLA", name: "Tesla, Inc.", sector: "Automotive" },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors" },
  { symbol: "SMCI", name: "Super Micro Computer", sector: "Hardware" },
  { symbol: "CVNA", name: "Carvana Co.", sector: "Retail" },
  { symbol: "BYND", name: "Beyond Meat", sector: "Consumer Staples" },
  { symbol: "PTON", name: "Peloton Interactive", sector: "Consumer Discretionary" },
  { symbol: "DKNG", name: "DraftKings Inc.", sector: "Entertainment" },
  { symbol: "UPST", name: "Upstart Holdings", sector: "Financial Services" },
  { symbol: "AFRM", name: "Affirm Holdings", sector: "Financial Services" },
];

// Research candidates from docs/stock-watchlist-candidates.md: range-bound names that better
// fit a 3-day mean-reversion strategy in current (July 2026) conditions than momentum names.
const RESEARCHED_CANDIDATES = [
  {
    symbol: "PFE",
    name: "Pfizer Inc.",
    sector: "Healthcare",
    notes: "Tier 1 range-bound candidate ($23-29 band, ~7% yield draws dip buyers). See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "PYPL",
    name: "PayPal Holdings",
    sector: "Financial Services",
    notes: "Tier 1 range-bound candidate (years of chop in the $40s-$60s). See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "NKE",
    name: "Nike, Inc.",
    sector: "Consumer Discretionary",
    notes: "Tier 1 range-bound candidate. Pause signals around quarterly earnings. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "VZ",
    name: "Verizon Communications",
    sector: "Telecom",
    notes: "Tier 1 low-volatility range-bound candidate. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "DIS",
    name: "The Walt Disney Company",
    sector: "Entertainment",
    notes: "Tier 1 candidate, multi-year $85-120 oscillator. Re-verify range before trading. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "F",
    name: "Ford Motor Company",
    sector: "Automotive",
    notes: "Tier 1 candidate, single-digit-to-low-teens band with dividend anchor. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "SBUX",
    name: "Starbucks Corporation",
    sector: "Consumer Discretionary",
    notes: "Tier 1 candidate, turnaround-driven chop, not yet a durable trend. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    sector: "Semiconductors",
    notes: "Tier 2 candidate, BUY-side only until the AI uptrend cools. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    sector: "Index ETF",
    notes: "Index mean reversion is more reliable than single stocks per the research notes. See docs/stock-watchlist-candidates.md.",
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    sector: "Index ETF",
    notes: "Index mean reversion is more reliable than single stocks per the research notes. See docs/stock-watchlist-candidates.md.",
  },
];

async function main() {
  const allTickers = [...STARTER_WATCHLIST, ...RESEARCHED_CANDIDATES];
  for (const ticker of allTickers) {
    await prisma.watchlistItem.upsert({
      where: { symbol: ticker.symbol },
      update: {},
      create: ticker,
    });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  console.log(`Seeded ${allTickers.length} watchlist tickers + default settings.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
