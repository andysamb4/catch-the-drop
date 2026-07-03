import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

  const signals = await prisma.signal.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    take: 20,
  });

  return NextResponse.json(signals);
}
