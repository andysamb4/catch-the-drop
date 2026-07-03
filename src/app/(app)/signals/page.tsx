import { getAllSignals } from "@/lib/signal-dto";
import { SignalsTable } from "@/components/signals/signals-table";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const signals = await getAllSignals();
  return <SignalsTable signals={signals} />;
}
