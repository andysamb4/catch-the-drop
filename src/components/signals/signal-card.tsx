import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SignalDTO } from "@/lib/signal-dto";

export function SignalCard({ signal }: { signal: SignalDTO }) {
  const isBuy = signal.type === "BUY";
  const Icon = isBuy ? TrendingDown : TrendingUp;

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-start gap-3 py-4">
        <div
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
            (isBuy ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive")
          }
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{signal.symbol}</span>
                <Badge variant={isBuy ? "default" : "destructive"}>{signal.type}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{signal.name}</p>
            </div>
            <div className="shrink-0 text-right text-sm tabular-nums">
              <div className={isBuy ? "text-primary" : "text-destructive"}>
                {signal.cumulativeMovePct > 0 ? "+" : ""}
                {signal.cumulativeMovePct.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">{signal.streakLength}-day streak</div>
            </div>
          </div>
          {signal.priceAtSignal != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              ~${signal.priceAtSignal.toFixed(2)}/share
              {signal.suggestedShares != null && (
                <> &middot; suggested {signal.suggestedShares} sh</>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
