import { prisma } from "@/lib/db";
import { YoYoHunterForm } from "@/components/yo-yo-hunter/yo-yo-hunter-form";

export const dynamic = "force-dynamic";

export default async function YoYoHunterPage() {
  const watchlist = await prisma.watchlistItem.findMany({
    where: { active: true },
    orderBy: { symbol: "asc" },
    select: { symbol: true },
  });

  return <YoYoHunterForm watchlistSymbols={watchlist.map((w) => w.symbol)} />;
}
