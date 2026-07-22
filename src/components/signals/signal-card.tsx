import { Sparkles, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/signals/sparkline";
import { cn } from "@/lib/utils";
import type { SignalDTO } from "@/lib/signal-dto";

// Current commentary is generated as "verdict line, then '- ' bullets" (see
// morningBriefPrompt). Older signals in the DB predate that format and are
// still a plain paragraph, so fall back to rendering the raw text untouched.
function parseCommentary(text: string): { verdict: string; bullets: string[] } | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•]\s+/.test(l)).map((l) => l.replace(/^[-•]\s+/, ""));
  if (bullets.length === 0) return null;
  const verdict = lines.find((l) => !/^[-•]\s+/.test(l)) ?? "";
  return { verdict, bullets };
}

function CommentaryBody({ text }: { text: string }) {
  const parsed = parseCommentary(text);
  if (!parsed) return <p className="text-xs text-foreground/80">{text}</p>;
  return (
    <>
      {parsed.verdict && <p className="text-xs font-semibold text-foreground">{parsed.verdict}</p>}
      <ul className="mt-1 space-y-0.5">
        {parsed.bullets.map((bullet, i) => (
          <li key={i} className="flex gap-1.5 text-xs text-foreground/80">
            <span className="text-muted-foreground">&middot;</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SignalCard({ signal }: { signal: SignalDTO }) {
  const isBuy = signal.type === "BUY";
  const isPoorFit = signal.strategyFit === "POOR";
  const moveColor = isBuy ? "text-primary" : "text-destructive";

  return (
    <Card
      className={cn(
        "rounded-2xl",
        isBuy ? "bg-accent/40 ring-primary/20" : "bg-destructive/5 ring-destructive/15",
        isPoorFit && "opacity-70"
      )}
    >
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight">{signal.symbol}</span>
              <Badge variant={isBuy ? "default" : "destructive"}>{signal.type}</Badge>
              {isPoorFit && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <TriangleAlert className="h-3 w-3" />
                  Poor fit
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{signal.name}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className={cn("text-lg font-bold tabular-nums", moveColor)}>
              {signal.cumulativeMovePct > 0 ? "+" : ""}
              {signal.cumulativeMovePct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">{signal.streakLength}-day streak</div>
          </div>
        </div>

        {(signal.sparkline || signal.priceAtSignal != null) && (
          <div className="mt-3 flex items-center gap-3">
            {signal.sparkline && (
              <Sparkline values={signal.sparkline} className={cn("shrink-0", moveColor)} />
            )}
            {signal.priceAtSignal != null && (
              <p className="text-xs text-muted-foreground">
                ~${signal.priceAtSignal.toFixed(2)}/share
                {signal.suggestedShares != null && (
                  <> &middot; suggested {signal.suggestedShares} sh</>
                )}
              </p>
            )}
          </div>
        )}

        {signal.aiCommentary && (
          <div className="mt-3 rounded-xl bg-card/70 p-2.5">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              Why this fired
            </p>
            <CommentaryBody text={signal.aiCommentary} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
