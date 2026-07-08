import { prisma } from "@/lib/db";
import type { Trade, WatchlistItem, Signal } from "@/generated/prisma/client";
import { calcRealizedPL, calcHoldingDays } from "@/lib/trade-math";

export { calcRealizedPL, calcHoldingDays };

export type TradeDTO = {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  entryDate: string;
  exitPrice: number | null;
  exitDate: string | null;
  exitReason: string | null;
  notes: string | null;
  status: "OPEN" | "CLOSED";
  realizedPL: number | null;
  signalId: string | null;
  signalStreakLength: number | null;
  holdingDays: number | null;
  thesisWorked: boolean | null;
  createdAt: string;
};

type TradeWithRelations = Trade & { watchlistItem: WatchlistItem; signal: Signal | null };

export function toTradeDTO(trade: TradeWithRelations): TradeDTO {
  const holdingDays =
    trade.exitDate != null ? calcHoldingDays(trade.entryDate, trade.exitDate) : null;

  return {
    id: trade.id,
    symbol: trade.symbol,
    name: trade.watchlistItem.name,
    sector: trade.watchlistItem.sector,
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    quantity: trade.quantity,
    entryDate: trade.entryDate.toISOString(),
    exitPrice: trade.exitPrice,
    exitDate: trade.exitDate ? trade.exitDate.toISOString() : null,
    exitReason: trade.exitReason,
    notes: trade.notes,
    status: trade.status,
    realizedPL: trade.realizedPL,
    signalId: trade.signalId,
    signalStreakLength: trade.signal?.streakLength ?? null,
    holdingDays,
    thesisWorked: trade.realizedPL != null ? trade.realizedPL > 0 : null,
    createdAt: trade.createdAt.toISOString(),
  };
}

export async function getAllTrades(): Promise<TradeDTO[]> {
  const trades = await prisma.trade.findMany({
    include: { watchlistItem: true, signal: true },
    orderBy: { entryDate: "desc" },
  });
  return trades.map(toTradeDTO);
}

export async function getOpenTradeCount(): Promise<number> {
  return prisma.trade.count({ where: { status: "OPEN" } });
}

// "Today" is the UTC calendar date, matching how entry/exit dates are stored (@db.Date).
export async function getTodaysRealizedPL(): Promise<number> {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const result = await prisma.trade.aggregate({
    _sum: { realizedPL: true },
    where: { status: "CLOSED", exitDate: todayUtc },
  });
  return result._sum.realizedPL ?? 0;
}
