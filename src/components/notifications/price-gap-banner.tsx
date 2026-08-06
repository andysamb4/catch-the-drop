import { ChevronDown, DatabaseZap } from "lucide-react";
import { getUnreadPriceGapNotifications, priceGapSymbol } from "@/lib/notifications";

// Deliberately quiet and collapsed, and rendered at the foot of the page. A gap
// no longer mutes a ticker (the scan backfills from Yahoo, then falls back to the
// bars since the hole), so this is a footnote about data quality — a red banner
// above the signals was drowning out the reporting it was annotating.
export async function PriceGapBanner() {
  const gaps = await getUnreadPriceGapNotifications();
  if (gaps.length === 0) return null;

  const symbols = gaps.map((gap) => priceGapSymbol(gap.title));

  return (
    <details className="group rounded-2xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs [&::-webkit-details-marker]:hidden">
        <DatabaseZap className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground/80">
            {gaps.length === 1 ? "1 ticker" : `${gaps.length} tickers`} with a history gap
          </span>{" "}
          &middot; {symbols.slice(0, 4).join(", ")}
          {symbols.length > 4 && ` +${symbols.length - 4}`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px]">
        {gaps.map((gap) => (
          <li key={gap.id}>
            <span className="font-medium text-foreground/80">{priceGapSymbol(gap.title)}</span>{" "}
            {gap.body}
          </li>
        ))}
      </ul>
    </details>
  );
}
