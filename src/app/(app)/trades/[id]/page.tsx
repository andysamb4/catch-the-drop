import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { toTradeDTO } from "@/lib/trade-dto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TradeDetailActions } from "@/components/trades/trade-detail-actions";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { watchlistItem: true, signal: true },
  });
  if (!trade) notFound();

  const dto = toTradeDTO(trade);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">{dto.symbol}</h2>
        <Badge variant={dto.direction === "LONG" ? "default" : "destructive"}>{dto.direction}</Badge>
        <Badge variant={dto.status === "OPEN" ? "outline" : "secondary"}>{dto.status}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{dto.name}</p>

      {dto.status === "CLOSED" && (
        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-3 py-4">
            <div
              className={
                "flex h-10 w-10 items-center justify-center rounded-xl " +
                (dto.thesisWorked ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive")
              }
            >
              {dto.thesisWorked ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-medium">{dto.thesisWorked ? "Bounce thesis worked" : "Bounce thesis didn't pan out"}</p>
              <p
                className={
                  "text-lg font-semibold tabular-nums " +
                  (dto.realizedPL != null && dto.realizedPL >= 0 ? "text-primary" : "text-destructive")
                }
              >
                {dto.realizedPL != null ? `${dto.realizedPL >= 0 ? "+" : ""}$${dto.realizedPL.toFixed(2)}` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Price" value={`$${dto.entryPrice.toFixed(2)}`} />
          <Row label="Quantity" value={dto.quantity} />
          <Row label="Date" value={new Date(dto.entryDate).toLocaleDateString()} />
          {dto.signalStreakLength != null && (
            <Row label="Signal" value={`${dto.signalStreakLength}-day streak`} />
          )}
        </CardContent>
      </Card>

      {dto.status === "CLOSED" && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Exit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Price" value={dto.exitPrice != null ? `$${dto.exitPrice.toFixed(2)}` : "—"} />
            <Row label="Date" value={dto.exitDate ? new Date(dto.exitDate).toLocaleDateString() : "—"} />
            <Row label="Holding period" value={dto.holdingDays != null ? `${dto.holdingDays}d` : "—"} />
            <Row label="Reason" value={dto.exitReason ?? "—"} />
          </CardContent>
        </Card>
      )}

      {dto.notes && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{dto.notes}</p>
          </CardContent>
        </Card>
      )}

      <TradeDetailActions trade={dto} />
    </div>
  );
}
