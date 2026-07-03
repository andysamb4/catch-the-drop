import { Receipt } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function TradesPage() {
  return (
    <ComingSoon
      icon={Receipt}
      title="Trade log coming in Phase 4"
      description="Log entries and exits from your eToro trades and track realized P/L here."
    />
  );
}
