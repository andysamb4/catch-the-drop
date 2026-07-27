import { Sunrise } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getActiveDailyBrief } from "@/lib/daily-brief";

function TapeChip({ label, pct }: { label: string; pct: number }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      )}
    >
      {label} {pct >= 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

// The everyday morning read: stance line + bullets from the daily-brief cron,
// with the overnight tape as chips. Neutral styling on purpose — amber
// (MarketAlertBanner) stays reserved for the rare major-incident days.
export async function DailyBriefCard() {
  const brief = await getActiveDailyBrief();
  if (!brief) return null;

  const [stance, ...rest] = brief.content.split("\n").map((l) => l.trim());
  const bullets = rest.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const dateLabel = brief.date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-2 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Sunrise className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Morning brief &middot; {dateLabel}
          </p>
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            {brief.spFuturesPct != null && <TapeChip label="S&P fut" pct={brief.spFuturesPct} />}
            {brief.nasdaqFuturesPct != null && (
              <TapeChip label="NDQ fut" pct={brief.nasdaqFuturesPct} />
            )}
            {brief.oilPct != null && <TapeChip label="Oil" pct={brief.oilPct} />}
            {brief.vix != null && (
              <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                VIX {brief.vix.toFixed(1)}
              </span>
            )}
          </span>
        </div>
        <p className="text-sm font-medium">{stance}</p>
        {bullets.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-primary">&bull;</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
