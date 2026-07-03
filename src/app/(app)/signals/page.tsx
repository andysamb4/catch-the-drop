import { History } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function SignalsPage() {
  return (
    <ComingSoon
      icon={History}
      title="Signal history coming in Phase 3"
      description="Every BUY and SHORT signal, sortable and filterable, once the nightly cron is live."
    />
  );
}
