import { Receipt } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ComingSoon
      icon={Receipt}
      title={`Trade ${id} coming in Phase 4`}
      description="Entry/exit detail, P/L, and holding period for this trade will show up here."
    />
  );
}
