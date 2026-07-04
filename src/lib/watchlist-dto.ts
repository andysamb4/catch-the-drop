import type { StrategyFit, WatchlistItem } from "@/generated/prisma/client";

// Client components always see dates as ISO strings (matches what fetch()+JSON returns),
// so the server page serializes its initial Prisma results the same way.
export type WatchlistItemDTO = {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  notes: string | null;
  active: boolean;
  yoyoScore: number | null;
  yoyoScoreAt: string | null;
  strategyFit: StrategyFit | null;
  strategyFitManual: boolean;
  addedAt: string;
};

export function toWatchlistItemDTO(item: WatchlistItem): WatchlistItemDTO {
  return {
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    sector: item.sector,
    notes: item.notes,
    active: item.active,
    yoyoScore: item.yoyoScore,
    yoyoScoreAt: item.yoyoScoreAt ? item.yoyoScoreAt.toISOString() : null,
    strategyFit: item.strategyFit,
    strategyFitManual: item.strategyFitManual,
    addedAt: item.addedAt.toISOString(),
  };
}
