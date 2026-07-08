import { prisma } from "@/lib/db";
import { generateText } from "@/lib/ai/client";
import { marketAlertPrompt } from "@/lib/ai/prompts";
import { getGeneralNews } from "@/lib/finnhub";
import { getVixSnapshot } from "@/lib/yahoo-finance";
import { utcDateOnly } from "@/lib/date";
import type { MarketAlert } from "@/generated/prisma/client";

// Headlines older than this are yesterday's news — the signal cron already ran
// on yesterday's close, so only genuinely-overnight events matter here.
const LOOKBACK_HOURS = 18;
const MAX_HEADLINES = 25;

export type MarketAlertRun = {
  status: "created" | "already_exists" | "no_headlines" | "no_major_event";
  alert: MarketAlert | null;
};

/**
 * Fetches overnight headlines + VIX, asks the LLM to act as a strict
 * major-events-only filter, and persists a MarketAlert row for today if (and
 * only if) something market-moving happened. Idempotent per day: a manual
 * re-run reuses today's existing alert rather than re-judging.
 */
export async function generateMarketAlert(): Promise<MarketAlertRun> {
  const today = utcDateOnly();

  const existing = await prisma.marketAlert.findUnique({ where: { date: today } });
  if (existing) return { status: "already_exists", alert: existing };

  const [news, vix] = await Promise.all([
    getGeneralNews().catch(() => []),
    getVixSnapshot().catch(() => null),
  ]);

  const cutoff = Date.now() / 1000 - LOOKBACK_HOURS * 3600;
  const recent = news.filter((n) => n.datetime >= cutoff).slice(0, MAX_HEADLINES);
  if (recent.length === 0) return { status: "no_headlines", alert: null };

  const raw = await generateText(
    marketAlertPrompt({
      headlines: recent.map((n) => ({ headline: n.headline, source: n.source })),
      vix,
    })
  );

  const parsed = parseAlertJson(raw);
  if (!parsed) return { status: "no_major_event", alert: null };

  const alert = await prisma.marketAlert.upsert({
    where: { date: today },
    update: {},
    create: {
      date: today,
      headline: parsed.headline,
      body: parsed.body,
      vix: vix?.level ?? null,
      vixChangePct: vix?.changePct ?? null,
    },
  });
  return { status: "created", alert };
}

// Tolerates code fences or stray prose around the JSON despite the prompt
// asking for none — smaller models drift on output-format instructions.
function parseAlertJson(raw: string): { headline: string; body: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const alert = JSON.parse(match[0])?.alert;
    if (alert && typeof alert.headline === "string" && typeof alert.body === "string") {
      return { headline: alert.headline, body: alert.body };
    }
  } catch {
    // fall through
  }
  return null;
}

/** One-line context string injected into per-signal morning-brief prompts. */
export function formatMarketContext(alert: MarketAlert): string {
  const vixPart =
    alert.vix != null
      ? ` VIX ${alert.vix.toFixed(1)}${
          alert.vixChangePct != null
            ? ` (${alert.vixChangePct >= 0 ? "+" : ""}${alert.vixChangePct.toFixed(0)}% vs prior close)`
            : ""
        }.`
      : "";
  return `${alert.headline} — ${alert.body}${vixPart}`;
}

/**
 * The alert the home page should currently show. 24-hour window (not
 * calendar-day) so an evening viewer still sees the morning's warning, and a
 * warning never lingers past one session.
 */
export async function getActiveMarketAlert(): Promise<MarketAlert | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.marketAlert.findFirst({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}
