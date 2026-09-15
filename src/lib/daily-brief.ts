import { prisma } from "@/lib/db";
import { AIError, generateText } from "@/lib/ai/client";
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
  status: "created" | "already_exists" | "repaired";
  brief: DailyBrief;
};

type BriefInput = {
  tape: OvernightTape;
  vix: { level: number; changePct: number } | null;
  earnings: string[];
  positions: string[];
  freshSignals: string[];
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

function isProviderPolicyText(content: string): boolean {
  return /request is blocked|prohibited use policy|pup violations?|account restrictions|ai\.google\.dev\/gemini-api/i.test(
    content
  );
}

function isUsableBriefContent(content: string): boolean {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 && !isProviderPolicyText(content);
}

function buildFallbackDailyBrief({ tape, vix, earnings, positions, freshSignals }: BriefInput): string {
  const riskOnSignals = [tape.spFuturesPct, tape.nasdaqFuturesPct].filter(
    (pct): pct is number => pct != null
  );
  const avgEquityFutures =
    riskOnSignals.length > 0 ? riskOnSignals.reduce((sum, pct) => sum + pct, 0) / riskOnSignals.length : null;

  const stance =
    avgEquityFutures == null
      ? "Open read is mixed; keep sizing disciplined"
      : avgEquityFutures >= 0.4
        ? "Risk-on open; longs have a tailwind"
        : avgEquityFutures <= -0.4
          ? "Risk-off open; size new longs carefully"
          : "Muted open; stock-specific setups matter most";

  const bullets: string[] = [];
  if (tape.oilPct != null && Math.abs(tape.oilPct) >= 1) {
    bullets.push(tape.oilPct > 0 ? "Oil strength may pressure risk appetite" : "Softer oil helps the inflation backdrop");
  } else if (avgEquityFutures != null) {
    bullets.push(avgEquityFutures >= 0 ? "Futures point to a supportive tape" : "Futures point to a cautious tape");
  }

  if (vix) {
    bullets.push(
      vix.level >= 22
        ? "Volatility is elevated, so mean-reversion tails are wider"
        : vix.level <= 15
          ? "Volatility is calm enough for normal position sizing"
          : "Volatility is watchful but not stressed"
    );
  }

  if (freshSignals.length > 0) {
    bullets.push(`${freshSignals.length} fresh BUY signal${freshSignals.length === 1 ? "" : "s"} need tape-aware sizing`);
  }

  if (earnings.length > 0) {
    bullets.push(`Earnings watch: ${earnings.slice(0, 2).join("; ")}`);
  }

  if (positions.length > 0) {
    bullets.push(`${positions.length} open or pending bot position${positions.length === 1 ? "" : "s"} ride the open`);
  }

  const uniqueBullets = Array.from(new Set(bullets)).slice(0, 5);
  return [stance, ...uniqueBullets.map((bullet) => `- ${bullet}`)].join("\n");
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
  if (existing && isUsableBriefContent(existing.content)) {
    return { status: "already_exists", brief: existing };
  }

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

  const fallbackContent = buildFallbackDailyBrief({
    tape,
    vix,
    earnings: ourEarnings,
    positions: positionLines,
    freshSignals: signalLines,
  });

  let raw: string;
  try {
    raw = await generateText(
      dailyBriefPrompt({
        tape: tapeLines,
        headlines,
        earnings: ourEarnings,
        positions: positionLines,
        freshSignals: signalLines,
      })
    );
  } catch (err) {
    if (!(err instanceof AIError)) {
      console.warn("Daily brief LLM failed; using fallback content", err);
    }
    raw = fallbackContent;
  }

  // Tolerate stray code fences despite the prompt asking for none.
  const generatedContent = raw.replace(/^```[a-z]*\n?|```$/g, "").trim();
  const content = isUsableBriefContent(generatedContent) ? generatedContent : fallbackContent;
  if (!content) throw new Error("LLM returned an empty daily brief");

  const brief = await prisma.dailyBrief.upsert({
    where: { date: today },
    update: {
      content,
      spFuturesPct: tape.spFuturesPct,
      nasdaqFuturesPct: tape.nasdaqFuturesPct,
      oilPct: tape.oilPct,
      vix: vix?.level ?? null,
      vixChangePct: vix?.changePct ?? null,
    },
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
  return { status: existing ? "repaired" : "created", brief };
}

/**
 * The brief the home page should currently show. Same 24-hour window as the
 * market alert: an evening viewer still sees the morning's brief, but it never
 * lingers past one session.
 */
export async function getActiveDailyBrief(): Promise<DailyBrief | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const brief = await prisma.dailyBrief.findFirst({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
  if (!brief || isUsableBriefContent(brief.content)) return brief;

  const content = buildFallbackDailyBrief({
    tape: {
      spFuturesPct: brief.spFuturesPct,
      nasdaqFuturesPct: brief.nasdaqFuturesPct,
      oilPct: brief.oilPct,
    },
    vix:
      brief.vix == null
        ? null
        : {
            level: brief.vix,
            changePct: brief.vixChangePct ?? 0,
          },
    earnings: [],
    positions: [],
    freshSignals: [],
  });

  return prisma.dailyBrief.update({
    where: { id: brief.id },
    data: { content },
  });
}
