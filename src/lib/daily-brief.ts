import { prisma } from "@/lib/db";
import { generateText } from "@/lib/ai/client";
import { dailyBriefPrompt } from "@/lib/ai/prompts";
import { getGeneralNews, getEarningsCalendar } from "@/lib/finnhub";
import { getOvernightTape, getVixSnapshot, type OvernightTape } from "@/lib/yahoo-finance";
import { getEtoroMode } from "@/lib/trading-config";
import { utcDateOnly } from "@/lib/date";
import type { DailyBrief } from "@/generated/prisma/client";

// Same freshness window as the market alert: the signals cron already digested
// everything up to yesterday's close, so only genuinely-overnight news counts.
const LOOKBACK_HOURS = 18;
// Fewer than the alert's 25 because each headline now carries its summary —
// the brief wants depth on the narrative, not exhaustive coverage.
const MAX_HEADLINES = 15;
const MAX_SUMMARY_CHARS = 240;
const EARNINGS_AHEAD_DAYS = 7;
// Signals older than this aren't "last night's scan" — they're history the
// brief shouldn't resurface (covers a weekend gap after Friday's scan).
const FRESH_SIGNAL_MAX_AGE_DAYS = 4;

export type DailyBriefRun = {
  status: "created" | "already_exists";
  brief: DailyBrief;
};

const HOUR_LABEL: Record<string, string> = {
  bmo: "before open",
  amc: "after close",
  dmh: "during hours",
};

function fmtPct(pct: number, digits = 1): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

function fmtDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generates today's pre-open digest — overnight tape, catalysts, earnings that
 * touch our names, open positions — and persists it as a DailyBrief row.
 * Unlike the market alert, this runs every weekday: quiet days still get a
 * brief, they just read quiet. Idempotent per day; a manual cron re-run
 * returns the existing row rather than paying for a second LLM call.
 */
export async function generateDailyBrief(): Promise<DailyBriefRun> {
  const today = utcDateOnly();

  const existing = await prisma.dailyBrief.findUnique({ where: { date: today } });
  if (existing) return { status: "already_exists", brief: existing };

  const mode = getEtoroMode();
  const earningsTo = new Date(today.getTime() + EARNINGS_AHEAD_DAYS * 24 * 3600 * 1000);

  const [tape, vix, news, earningsAll, positions, watchlist, latestSignal] = await Promise.all([
    getOvernightTape().catch(
      (): OvernightTape => ({ spFuturesPct: null, nasdaqFuturesPct: null, oilPct: null })
    ),
    getVixSnapshot().catch(() => null),
    getGeneralNews().catch(() => []),
    getEarningsCalendar(isoDate(today), isoDate(earningsTo)).catch(() => []),
    prisma.botPosition.findMany({
      where: { mode, status: { in: ["PENDING", "OPEN"] } },
      orderBy: { openedAt: "asc" },
    }),
    prisma.watchlistItem.findMany({ where: { active: true }, select: { symbol: true } }),
    // BUY-only: the scan is long-only, so a pre-switch SHORT row must never
    // anchor the "fresh signals" date or appear in the brief as actionable.
    prisma.signal.findFirst({ where: { type: "BUY" }, orderBy: { date: "desc" } }),
  ]);

  const cutoff = Date.now() / 1000 - LOOKBACK_HOURS * 3600;
  const headlines = news
    .filter((n) => n.datetime >= cutoff)
    .slice(0, MAX_HEADLINES)
    .map((n) => ({
      headline: n.headline,
      source: n.source,
      summary: (n.summary ?? "").slice(0, MAX_SUMMARY_CHARS),
    }));

  const signalMaxAge = FRESH_SIGNAL_MAX_AGE_DAYS * 24 * 3600 * 1000;
  const freshSignals =
    latestSignal && today.getTime() - latestSignal.date.getTime() <= signalMaxAge
      ? await prisma.signal.findMany({ where: { date: latestSignal.date, type: "BUY" } })
      : [];

  const heldSymbols = new Set(positions.map((p) => p.symbol));
  const signalSymbols = new Set(freshSignals.map((s) => s.symbol));
  const watchedSymbols = new Set(watchlist.map((w) => w.symbol));
  const ourEarnings = earningsAll
    .filter((e) => watchedSymbols.has(e.symbol) || heldSymbols.has(e.symbol))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const hour = HOUR_LABEL[e.hour];
      const tags = [
        heldSymbols.has(e.symbol) && "OPEN POSITION",
        signalSymbols.has(e.symbol) && "fresh signal",
      ].filter(Boolean);
      return `${e.symbol} reports ${fmtDay(e.date)}${hour ? ` (${hour})` : ""}${
        tags.length ? ` — ${tags.join(", ")}` : ""
      }`;
    });

  const tapeLines = [
    tape.spFuturesPct != null && `S&P 500 futures ${fmtPct(tape.spFuturesPct)} overnight`,
    tape.nasdaqFuturesPct != null && `Nasdaq 100 futures ${fmtPct(tape.nasdaqFuturesPct)}`,
    tape.oilPct != null && `WTI crude ${fmtPct(tape.oilPct)}`,
    vix && `VIX ${vix.level.toFixed(1)} (${fmtPct(vix.changePct, 0)} vs prior close)`,
  ].filter((l): l is string => Boolean(l));

  const positionLines = positions.map((p) => {
    const entry =
      p.status === "PENDING" || p.entryPrice == null
        ? "fill pending"
        : `entry ${p.entryPrice}, TP ${p.takeProfitRate ?? "?"}`;
    return `${p.direction} ${p.symbol} (${p.strategy}), $${Math.round(p.requestedUsd)}, ${entry}`;
  });

  const signalLines = freshSignals.map(
    (s) =>
      `${s.type} ${s.symbol} (${s.strategy}): ${s.streakLength}-day streak, ${s.cumulativeMovePct.toFixed(1)}% cumulative`
  );

  const raw = await generateText(
    dailyBriefPrompt({
      tape: tapeLines,
      headlines,
      earnings: ourEarnings,
      positions: positionLines,
      freshSignals: signalLines,
    })
  );

  // Tolerate stray code fences despite the prompt asking for none.
  const content = raw.replace(/^```[a-z]*\n?|```$/g, "").trim();
  if (!content) throw new Error("LLM returned an empty daily brief");

  const brief = await prisma.dailyBrief.upsert({
    where: { date: today },
    update: {},
    create: {
      date: today,
      content,
      spFuturesPct: tape.spFuturesPct,
      nasdaqFuturesPct: tape.nasdaqFuturesPct,
      oilPct: tape.oilPct,
      vix: vix?.level ?? null,
      vixChangePct: vix?.changePct ?? null,
    },
  });
  return { status: "created", brief };
}

/**
 * The brief the home page should currently show. Same 24-hour window as the
 * market alert: an evening viewer still sees the morning's brief, but it never
 * lingers past one session.
 */
export async function getActiveDailyBrief(): Promise<DailyBrief | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.dailyBrief.findFirst({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}
