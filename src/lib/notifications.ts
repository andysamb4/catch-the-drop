import { prisma } from "@/lib/db";

export const PRICE_GAP_NOTIFICATION_TYPE = "price_gap";

const PRICE_GAP_TITLE_PREFIX = "Price data gap: ";

function formatMissingDates(missingDates: Date[]): string {
  return missingDates.map((d) => d.toISOString().slice(0, 10)).join(", ");
}

export function priceGapSymbol(title: string): string {
  return title.startsWith(PRICE_GAP_TITLE_PREFIX)
    ? title.slice(PRICE_GAP_TITLE_PREFIX.length)
    : title;
}

/**
 * Records a hole that survived the Yahoo backfill. Kept deliberately terse: the
 * home page renders one line per symbol, and detection is no longer blocked by a
 * gap (see barsAfterLastGap), so this is a data-quality note rather than an alarm.
 */
export async function recordPriceGap(
  symbol: string,
  missingDates: Date[],
  detail: string
): Promise<void> {
  const title = `${PRICE_GAP_TITLE_PREFIX}${symbol}`;
  const body = `No bar for ${formatMissingDates(missingDates)} and backfill couldn't fill it. ${detail}`;

  // Dedupe: don't spam a fresh notification if the exact same unread gap was already recorded.
  const existing = await prisma.notification.findFirst({
    where: { type: PRICE_GAP_NOTIFICATION_TYPE, title, body, read: false },
  });
  if (existing) return;

  await prisma.notification.create({
    data: { type: PRICE_GAP_NOTIFICATION_TYPE, title, body },
  });
}

/**
 * Clears a symbol's outstanding gap notices once its history is whole again.
 * Without this the banner keeps reporting holes that a later backfill already
 * closed — nothing else ever marks these read.
 */
export async function resolvePriceGaps(symbol: string): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      type: PRICE_GAP_NOTIFICATION_TYPE,
      title: `${PRICE_GAP_TITLE_PREFIX}${symbol}`,
      read: false,
    },
    data: { read: true },
  });
}

export async function getUnreadPriceGapNotifications() {
  return prisma.notification.findMany({
    where: { type: PRICE_GAP_NOTIFICATION_TYPE, read: false },
    orderBy: { createdAt: "desc" },
  });
}
