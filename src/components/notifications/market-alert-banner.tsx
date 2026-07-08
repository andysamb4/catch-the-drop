import { Siren } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMarketAlert } from "@/lib/market-alert";

// Amber, not destructive: red is the "your data is broken" lane (price gaps) —
// this is "the world moved overnight, read your signals in that light".
export async function MarketAlertBanner() {
  const alert = await getActiveMarketAlert();
  if (!alert) return null;

  return (
    <Card className="rounded-2xl border-amber-500/40 bg-amber-500/10">
      <CardContent className="flex items-start gap-3 py-3">
        <Siren className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            Market alert: {alert.headline}
            {alert.vix != null && (
              <span className="ml-2 whitespace-nowrap rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums align-middle">
                VIX {alert.vix.toFixed(1)}
                {alert.vixChangePct != null && (
                  <>
                    {" "}
                    ({alert.vixChangePct >= 0 ? "+" : ""}
                    {alert.vixChangePct.toFixed(0)}%)
                  </>
                )}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{alert.body}</p>
        </div>
      </CardContent>
    </Card>
  );
}
