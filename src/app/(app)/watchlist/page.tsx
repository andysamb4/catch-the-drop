import { LayoutList } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function WatchlistPage() {
  return (
    <ComingSoon
      icon={LayoutList}
      title="Watchlist coming in Phase 2"
      description="Add and remove tickers, see sector and yo-yo score once the database is connected."
    />
  );
}
