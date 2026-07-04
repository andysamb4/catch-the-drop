import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deriveStrategyFit } from "@/lib/strategy-fit";
import type { Prisma, StrategyFit } from "@/generated/prisma/client";

const STRATEGY_FIT_VALUES: StrategyFit[] = ["GOOD", "MODERATE", "POOR"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const data: Prisma.WatchlistItemUpdateInput = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.sector === "string") data.sector = body.sector.trim() || null;
  if (typeof body?.notes === "string") data.notes = body.notes.trim() || null;

  // strategyFit: "AUTO" clears the manual override and re-derives from the existing
  // yo-yo score right away, rather than leaving it stale until the next nightly cron.
  if (body?.strategyFit === "AUTO") {
    data.strategyFitManual = false;
    const current = await prisma.watchlistItem.findUnique({ where: { id } });
    if (current?.yoyoScore != null) {
      const barCount = await prisma.priceBar.count({ where: { symbol: current.symbol } });
      data.strategyFit = deriveStrategyFit(current.yoyoScore, barCount);
    } else {
      data.strategyFit = null;
    }
  } else if (typeof body?.strategyFit === "string" && STRATEGY_FIT_VALUES.includes(body.strategyFit as StrategyFit)) {
    data.strategyFit = body.strategyFit as StrategyFit;
    data.strategyFitManual = true;
  }

  try {
    const item = await prisma.watchlistItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Watchlist item not found." }, { status: 404 });
  }
}

// Soft delete: keeps signal/trade history intact for a ticker you're no longer watching.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.watchlistItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Watchlist item not found." }, { status: 404 });
  }
}
