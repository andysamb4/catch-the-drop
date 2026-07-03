import { prisma } from "@/lib/db";
import { toWatchlistItemDTO } from "@/lib/watchlist-dto";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const items = await prisma.watchlistItem.findMany({
    where: { active: true },
    orderBy: { addedAt: "desc" },
  });

  return <WatchlistTable initialItems={items.map(toWatchlistItemDTO)} />;
}
