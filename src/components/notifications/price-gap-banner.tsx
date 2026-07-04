import { TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getUnreadPriceGapNotifications } from "@/lib/notifications";

export async function PriceGapBanner() {
  const gaps = await getUnreadPriceGapNotifications();
  if (gaps.length === 0) return null;

  return (
    <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-start gap-3 py-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-medium text-destructive">
            {gaps.length === 1 ? "Price data gap detected" : `${gaps.length} price data gaps detected`}
          </p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {gaps.map((gap) => (
              <li key={gap.id}>{gap.body}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
