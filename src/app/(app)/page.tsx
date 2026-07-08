import Link from "next/link";
import { Zap } from "lucide-react";
import { getLatestSignals } from "@/lib/signal-dto";
import { getOpenTradeCount, getTodaysRealizedPL } from "@/lib/trade-dto";
import { getScanStatus, formatAgo } from "@/lib/scan-status";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { SignalCard } from "@/components/signals/signal-card";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PriceGapBanner } from "@/components/notifications/price-gap-banner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [signals, openCount, settings, todaysPL, scan] = await Promise.all([
    getLatestSignals(),
    getOpenTradeCount(),
    prisma.settings.findUnique({ where: { id: 1 } }),
    getTodaysRealizedPL(),
    getScanStatus(),
  ]);
  const maxOpenPositions = settings?.maxOpenPositions ?? 5;
  const atCap = openCount >= maxOpenPositions;
  const openPct = Math.min(100, Math.round((openCount / maxOpenPositions) * 100));

  return (
    <div className="space-y-4">
      <PriceGapBanner />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-foreground p-3.5 text-background">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-background/60">
            Open positions
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {openCount}
            <span className="text-sm font-medium text-background/60">/{maxOpenPositions}</span>
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/20">
            <div
              className={cn("h-full rounded-full", atCap ? "bg-destructive" : "bg-primary")}
              style={{ width: `${openPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl bg-foreground p-3.5 text-background">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-background/60">
            Today&apos;s P/L
          </p>
          {/* Brightened teal/red for legibility on the dark tile; theme tokens target light surfaces. */}
          <p
            className={cn(
              "mt-1 text-xl font-bold tabular-nums",
              todaysPL > 0 && "text-[oklch(0.68_0.12_178)]",
              todaysPL < 0 && "text-[oklch(0.68_0.16_25)]"
            )}
          >
            {todaysPL < 0 ? "-" : "+"}${Math.abs(todaysPL).toFixed(2)}
          </p>
          <p className="mt-2 text-[11px] text-background/60">
            {openCount} open &middot; unrealized pending
          </p>
        </div>
      </div>

      {scan.lastScanAt ? (
        <p className="text-sm text-muted-foreground">
          Fresh signals from the last scan &middot; ran {formatAgo(scan.lastScanAt)}
          {scan.scanned < scan.total ? (
            <span className="font-medium text-destructive">
              {" "}
              &middot; only {scan.scanned}/{scan.total} tickers scanned
            </span>
          ) : (
            <span> &middot; all {scan.total} tickers</span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Fresh signals from the last nightly scan.
        </p>
      )}

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
