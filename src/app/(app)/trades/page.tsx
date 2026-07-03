import { prisma } from "@/lib/db";
import { getAllTrades } from "@/lib/trade-dto";
import { TradesTable } from "@/components/trades/trades-table";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const [trades, watchlist] = await Promise.all([
    getAllTrades(),
    prisma.watchlistItem.findMany({ orderBy: { symbol: "asc" }, select: { symbol: true, name: true } }),
  ]);

  return <TradesTable initialTrades={trades} watchlist={watchlist} />;
}
