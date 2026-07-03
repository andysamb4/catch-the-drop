import { getAllTrades } from "@/lib/trade-dto";
import { PerformanceDashboard } from "@/components/performance/performance-dashboard";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const trades = await getAllTrades();
  return <PerformanceDashboard trades={trades} />;
}
