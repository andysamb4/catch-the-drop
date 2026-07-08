import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateText, AIError } from "@/lib/ai/client";
import { morningBriefPrompt } from "@/lib/ai/prompts";
import { generateMarketAlert, formatMarketContext } from "@/lib/market-alert";

// One sequential LLM call per fresh signal plus the market-alert check: a busy
// day (manual rescan → 8+ fresh signals) overruns 60s, so take the full budget.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Overnight macro check runs before (and regardless of) signal commentary:
  // the home-page warning matters even on days with no fresh signals. A
  // failure here must not take the whole brief down with it.
  let marketAlertStatus: string;
  let marketContext: string | undefined;
  try {
    const run = await generateMarketAlert();
    marketAlertStatus = run.status;
    if (run.alert) marketContext = formatMarketContext(run.alert);
  } catch (err) {
    marketAlertStatus = `error: ${err instanceof AIError ? err.message : (err as Error).message}`;
  }

  const latest = await prisma.signal.findFirst({ orderBy: { date: "desc" } });
  if (!latest) {
    return NextResponse.json({
      ranAt: new Date().toISOString(),
      marketAlert: marketAlertStatus,
      results: [],
      note: "No signals yet.",
    });
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
          marketContext,
        })
      );
      await prisma.signal.update({ where: { id: signal.id }, data: { aiCommentary: commentary } });
      results.push({ symbol: signal.symbol, status: "ok" });
    } catch (err) {
      const message = err instanceof AIError ? err.message : (err as Error).message;
      results.push({ symbol: signal.symbol, status: `error: ${message}` });
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    briefDate: latest.date,
    marketAlert: marketAlertStatus,
    results,
  });
}
