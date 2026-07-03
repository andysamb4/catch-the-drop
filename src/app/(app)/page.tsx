import { Zap } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Fresh 3-day drop and climb signals will show up here as soon as the watchlist and
        nightly cron are wired up.
      </p>
      <ComingSoon
        icon={Zap}
        title="Signals dashboard coming in Phase 3"
        description="Once tickers are on your watchlist, today's BUY and SHORT signals will land here first."
      />
    </div>
  );
}
