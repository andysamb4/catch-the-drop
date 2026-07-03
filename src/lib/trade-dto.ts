import { prisma } from "@/lib/db";
import type { Trade, WatchlistItem, Signal } from "@/generated/prisma/client";

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

/** LONG profits when price rises, SHORT profits when price falls. */
export function calcRealizedPL(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  quantity: number
): number {
  const perShare = direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return perShare * quantity;
}

export function calcHoldingDays(entryDate: Date, exitDate: Date): number {
  return Math.round((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
}

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
