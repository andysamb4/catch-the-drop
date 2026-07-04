import { prisma } from "@/lib/db";

export const PRICE_GAP_NOTIFICATION_TYPE = "price_gap";

function formatMissingDates(missingDates: Date[]): string {
  return missingDates.map((d) => d.toISOString().slice(0, 10)).join(", ");
}

export async function recordPriceGap(symbol: string, missingDates: Date[]): Promise<void> {
  const title = `Price data gap: ${symbol}`;
  const body = `Missing trading-day bars for ${formatMissingDates(missingDates)}. Signal detection was skipped for ${symbol} this run to avoid computing a streak across the hole.`;

  // Dedupe: don't spam a fresh notification if the exact same unread gap was already recorded.
  const existing = await prisma.notification.findFirst({
    where: { type: PRICE_GAP_NOTIFICATION_TYPE, title, body, read: false },
  });
  if (existing) return;

  await prisma.notification.create({
    data: { type: PRICE_GAP_NOTIFICATION_TYPE, title, body },
  });
}

export async function getUnreadPriceGapNotifications() {
  return prisma.notification.findMany({
    where: { type: PRICE_GAP_NOTIFICATION_TYPE, read: false },
    orderBy: { createdAt: "desc" },
  });
}
