import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const items = await prisma.watchlistItem.findMany({
    where: { active: true },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const sector = typeof body?.sector === "string" && body.sector.trim() ? body.sector.trim() : null;
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!symbol || !/^[A-Z.]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Enter a valid ticker symbol." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  const existing = await prisma.watchlistItem.findUnique({ where: { symbol } });
  if (existing) {
    if (existing.active) {
      return NextResponse.json({ error: `${symbol} is already on your watchlist.` }, { status: 409 });
    }
    // Re-adding a previously removed ticker: reactivate rather than duplicate, so its
    // signal/trade history stays attached to the same row.
    const reactivated = await prisma.watchlistItem.update({
      where: { symbol },
      data: { active: true, name, sector, notes },
    });
    return NextResponse.json(reactivated, { status: 200 });
  }

  const item = await prisma.watchlistItem.create({
    data: { symbol, name, sector, notes },
  });
  return NextResponse.json(item, { status: 201 });
}
