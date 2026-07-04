import { getAllSignals } from "@/lib/signal-dto";
import { SignalsTable } from "@/components/signals/signals-table";
import { PriceGapBanner } from "@/components/notifications/price-gap-banner";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const signals = await getAllSignals();
  return (
    <div className="space-y-4">
      <PriceGapBanner />
      <SignalsTable signals={signals} />
    </div>
  );
}
