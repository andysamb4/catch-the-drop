import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const positionSizeUsd = Number(body?.positionSizeUsd);
  const maxOpenPositions = Number(body?.maxOpenPositions);
  const minSignalMovePct = Number(body?.minSignalMovePct);

  if (!Number.isInteger(positionSizeUsd) || positionSizeUsd <= 0) {
    return NextResponse.json(
      { error: "Position size must be a positive whole dollar amount." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(maxOpenPositions) || maxOpenPositions <= 0) {
    return NextResponse.json(
      { error: "Max open positions must be a positive whole number." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(minSignalMovePct) || minSignalMovePct <= 0) {
    return NextResponse.json(
      { error: "Minimum signal move % must be a positive number." },
      { status: 400 }
    );
  }

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, positionSizeUsd, maxOpenPositions, minSignalMovePct },
    update: { positionSizeUsd, maxOpenPositions, minSignalMovePct },
  });

  return NextResponse.json(settings);
}
