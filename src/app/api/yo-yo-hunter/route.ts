import { NextRequest, NextResponse } from "next/server";
import { getYearOfDailyCloses } from "@/lib/yahoo-finance";
import { computeYoyoScore } from "@/lib/yoyo-score";
import { generateText, AIError } from "@/lib/ai/client";
import { yoyoHunterPrompt } from "@/lib/ai/prompts";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol) {
    return NextResponse.json({ error: "Ticker symbol is required." }, { status: 400 });
  }

  const bars = await getYearOfDailyCloses(symbol);
  if (!bars || bars.length < 10) {
    return NextResponse.json({ error: `Couldn't find price history for ${symbol}.` }, { status: 404 });
  }

  const closes = bars.map((b) => b.close);
  const yoyoScore = computeYoyoScore(closes);
  const cumulativeReturnPct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  const months = Math.round(bars.length / 21); // ~21 trading days per month

  let verdict: string | null = null;
  let verdictError: string | null = null;
  try {
    verdict = await generateText(yoyoHunterPrompt({ symbol, yoyoScore, months, cumulativeReturnPct }));
  } catch (err) {
    verdictError = err instanceof AIError ? err.message : "The assistant hit an unexpected error.";
  }

  return NextResponse.json({
    symbol,
    yoyoScore,
    cumulativeReturnPct,
    months,
    verdict,
    verdictError,
    priceHistory: bars,
  });
}
