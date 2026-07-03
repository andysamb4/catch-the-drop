import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calcRealizedPL } from "@/lib/trade-dto";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return NextResponse.json({ error: "Trade not found." }, { status: 404 });

  // Logging an exit: exitPrice + exitDate present closes the trade and computes P/L.
  if (body?.exitPrice != null && body?.exitDate) {
    const exitPrice = Number(body.exitPrice);
    const exitDate = new Date(body.exitDate);
    const exitReason = typeof body?.exitReason === "string" && body.exitReason.trim() ? body.exitReason.trim() : null;

    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      return NextResponse.json({ error: "Exit price must be a positive number." }, { status: 400 });
    }
    if (Number.isNaN(exitDate.getTime())) {
      return NextResponse.json({ error: "Exit date is invalid." }, { status: 400 });
    }

    const realizedPL = calcRealizedPL(trade.direction, trade.entryPrice, exitPrice, trade.quantity);

    const updated = await prisma.trade.update({
      where: { id },
      data: { exitPrice, exitDate, exitReason, realizedPL, status: "CLOSED" },
    });
    return NextResponse.json(updated);
  }

  // Otherwise just update notes on an existing trade.
  const notes = typeof body?.notes === "string" ? body.notes.trim() || null : undefined;
  const updated = await prisma.trade.update({
    where: { id },
    data: { ...(notes !== undefined ? { notes } : {}) },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.trade.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
}
