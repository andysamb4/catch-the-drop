import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateText, AIError } from "@/lib/ai/client";
import { morningBriefPrompt } from "@/lib/ai/prompts";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latest = await prisma.signal.findFirst({ orderBy: { date: "desc" } });
  if (!latest) {
    return NextResponse.json({ ranAt: new Date().toISOString(), results: [], note: "No signals yet." });
  }

  const freshSignals = await prisma.signal.findMany({
    where: { date: latest.date, aiCommentary: null },
    include: { watchlistItem: true },
  });

  const results: Array<{ symbol: string; status: string }> = [];

  for (const signal of freshSignals) {
    try {
      const commentary = await generateText(
        morningBriefPrompt({
          symbol: signal.symbol,
          name: signal.watchlistItem.name,
          type: signal.type,
          streakLength: signal.streakLength,
          cumulativeMovePct: signal.cumulativeMovePct,
        })
      );
      await prisma.signal.update({ where: { id: signal.id }, data: { aiCommentary: commentary } });
      results.push({ symbol: signal.symbol, status: "ok" });
    } catch (err) {
      const message = err instanceof AIError ? err.message : (err as Error).message;
      results.push({ symbol: signal.symbol, status: `error: ${message}` });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), briefDate: latest.date, results });
}
