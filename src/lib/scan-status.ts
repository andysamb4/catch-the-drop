import { prisma } from "@/lib/db";

// A complete scan touches every active ticker's lastScannedAt within a minute or
// two. Anything lagging the newest timestamp by more than this window was missed —
// evidence of a run that died partway (timeout, crash, interrupted local run).
const SCAN_WINDOW_MS = 30 * 60 * 1000;

export type ScanStatus = {
  lastScanAt: Date | null;
  scanned: number;
  total: number;
};

export async function getScanStatus(): Promise<ScanStatus> {
  const items = await prisma.watchlistItem.findMany({
    where: { active: true },
    select: { lastScannedAt: true },
  });
  const times = items
    .map((i) => i.lastScannedAt?.getTime())
    .filter((t): t is number => t != null);
  if (times.length === 0) return { lastScanAt: null, scanned: 0, total: items.length };

  const last = Math.max(...times);
  return {
    lastScanAt: new Date(last),
    scanned: times.filter((t) => t >= last - SCAN_WINDOW_MS).length,
    total: items.length,
  };
}

export function formatAgo(from: Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
