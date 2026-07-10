import { SandboxDashboard } from "@/components/sandbox/sandbox-dashboard";
import { SANDBOX_REFRESH_MS } from "@/lib/trading-config";

export const dynamic = "force-dynamic";

// Demo-only monitoring page. All data comes from /api/sandbox, which is
// hard-pinned to eToro's /demo/ endpoints regardless of ETORO_MODE — this
// page can never show or touch real-money data.
export default function SandboxPage() {
  return <SandboxDashboard refreshMs={SANDBOX_REFRESH_MS} />;
}
