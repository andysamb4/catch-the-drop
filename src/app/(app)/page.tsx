import Link from "next/link";
import { Zap } from "lucide-react";
import { getLatestSignals } from "@/lib/signal-dto";
import { getOpenTradeCount } from "@/lib/trade-dto";
import { prisma } from "@/lib/db";
import { SignalCard } from "@/components/signals/signal-card";
import { ComingSoon } from "@/components/layout/coming-soon";
import { Badge } from "@/components/ui/badge";
import { PriceGapBanner } from "@/components/notifications/price-gap-banner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [signals, openCount, settings] = await Promise.all([
    getLatestSignals(),
    getOpenTradeCount(),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);
  const maxOpenPositions = settings?.maxOpenPositions ?? 5;
  const atCap = openCount >= maxOpenPositions;

  return (
    <div className="space-y-4">
      <PriceGapBanner />
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Fresh signals from the last nightly scan.
        </p>
        <Badge variant={atCap ? "destructive" : "outline"}>
          {openCount}/{maxOpenPositions} positions open
        </Badge>
      </div>

      {signals.length === 0 ? (
        <ComingSoon
          icon={Zap}
          title="No fresh signals today"
          description="The nightly scan runs weekday evenings after market close. Check back tomorrow, or browse the full history."
        />
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
      <Link
        href="/signals"
        className="block text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        View full signal history
      </Link>
    </div>
  );
}
