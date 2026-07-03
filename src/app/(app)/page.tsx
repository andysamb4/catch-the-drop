import Link from "next/link";
import { Zap } from "lucide-react";
import { getTodaysSignals } from "@/lib/signal-dto";
import { SignalCard } from "@/components/signals/signal-card";
import { ComingSoon } from "@/components/layout/coming-soon";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const signals = await getTodaysSignals();

  return (
    <div className="space-y-4">
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
