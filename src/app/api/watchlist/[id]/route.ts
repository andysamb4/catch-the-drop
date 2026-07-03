import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const data: { name?: string; sector?: string | null; notes?: string | null } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.sector === "string") data.sector = body.sector.trim() || null;
  if (typeof body?.notes === "string") data.notes = body.notes.trim() || null;

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
