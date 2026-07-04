import { prisma } from "@/lib/db";
import type { ToolDefinition } from "@/lib/ai/client";

export const AI_TOOLS: ToolDefinition[] = [
  {
    name: "get_watchlist",
    description: "Get the current stock watchlist: symbol, name, sector, and yo-yo score.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_signals",
    description: "Get recent 3-day BUY (drop) / SHORT (climb) signals, optionally filtered by ticker.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional ticker to filter by" },
        limit: { type: "number", description: "Max results, default 20" },
      },
      required: [],
    },
  },
  {
    name: "get_trades",
    description: "Get logged trades, optionally filtered by status (OPEN/CLOSED) or ticker.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["OPEN", "CLOSED"] },
        symbol: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "get_price_history",
    description:
      "Get the app's accumulated daily closing prices for a ticker (only as far back as the nightly cron has been running — not a full historical record).",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
];

export async function executeAiTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_watchlist": {
      const items = await prisma.watchlistItem.findMany({ where: { active: true } });
      return items.map((i) => ({
        symbol: i.symbol,
        name: i.name,
        sector: i.sector,
        yoyoScore: i.yoyoScore,
      }));
    }

    case "get_signals": {
      const symbol = typeof args.symbol === "string" ? args.symbol.toUpperCase() : undefined;
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const signals = await prisma.signal.findMany({
        where: symbol ? { symbol } : {},
        orderBy: { date: "desc" },
        take: limit,
      });
      return signals.map((s) => ({
        symbol: s.symbol,
        date: s.date.toISOString().slice(0, 10),
        type: s.type,
        streakLength: s.streakLength,
        cumulativeMovePct: s.cumulativeMovePct,
      }));
    }

    case "get_trades": {
      const symbol = typeof args.symbol === "string" ? args.symbol.toUpperCase() : undefined;
      const status = args.status === "OPEN" || args.status === "CLOSED" ? args.status : undefined;
      const trades = await prisma.trade.findMany({
        where: { ...(symbol ? { symbol } : {}), ...(status ? { status } : {}) },
        orderBy: { entryDate: "desc" },
        take: 20,
      });
      return trades.map((t) => ({
        symbol: t.symbol,
        direction: t.direction,
        status: t.status,
        entryPrice: t.entryPrice,
        quantity: t.quantity,
        entryDate: t.entryDate.toISOString().slice(0, 10),
        exitPrice: t.exitPrice,
        exitDate: t.exitDate ? t.exitDate.toISOString().slice(0, 10) : null,
        realizedPL: t.realizedPL,
      }));
    }

    case "get_price_history": {
      const symbol = typeof args.symbol === "string" ? args.symbol.toUpperCase() : null;
      if (!symbol) return { error: "symbol is required" };
      const bars = await prisma.priceBar.findMany({
        where: { symbol },
        orderBy: { date: "asc" },
      });
      return bars.map((b) => ({ date: b.date.toISOString().slice(0, 10), close: b.close }));
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
