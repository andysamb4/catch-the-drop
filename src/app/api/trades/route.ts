import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAllTrades } from "@/lib/trade-dto";

export async function GET() {
  const trades = await getAllTrades();
  return NextResponse.json(trades);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const direction = body?.direction === "LONG" || body?.direction === "SHORT" ? body.direction : null;
  const entryPrice = Number(body?.entryPrice);
  const quantity = Number(body?.quantity);
  const entryDate = body?.entryDate ? new Date(body.entryDate) : null;
  const signalId = typeof body?.signalId === "string" && body.signalId ? body.signalId : null;
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!symbol) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
  if (!direction) return NextResponse.json({ error: "Direction must be long or short." }, { status: 400 });
  if (!Number.isFinite(entryPrice) || entryPrice <= 0)
    return NextResponse.json({ error: "Entry price must be a positive number." }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0)
    return NextResponse.json({ error: "Quantity must be a positive number." }, { status: 400 });
  if (!entryDate || Number.isNaN(entryDate.getTime()))
    return NextResponse.json({ error: "Entry date is invalid." }, { status: 400 });

  const ticker = await prisma.watchlistItem.findUnique({ where: { symbol } });
  if (!ticker) {
    return NextResponse.json({ error: `${symbol} isn't on your watchlist.` }, { status: 400 });
  }

  const trade = await prisma.trade.create({
    data: { symbol, direction, entryPrice, quantity, entryDate, signalId, notes },
  });

  return NextResponse.json(trade, { status: 201 });
}
