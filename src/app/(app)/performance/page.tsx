import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function PerformancePage() {
  return (
    <ComingSoon
      icon={BarChart3}
      title="Performance dashboard coming in Phase 4"
      description="Win rate, equity curve, monthly P/L, and streak-length breakdowns land here."
    />
  );
}
