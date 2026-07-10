import { prisma } from "@/lib/db";
import type { EtoroMode } from "@/lib/trading-config";

export type BotEventType =
  | "SIGNAL"
  | "ORDER_PLACED"
  | "ORDER_REJECTED"
  | "ORDER_BLOCKED"
  | "ORDER_SKIPPED"
  | "ORDER_FILLED"
  | "POSITION_CLOSED"
  | "POLL"
  | "ERROR";

// Append-only trail of everything the auto-trader does, surfaced on the
// sandbox page. Also mirrored to console so Vercel function logs carry the
// same record. Logging must never break the trading flow — failures are
// swallowed after a console warning.
export async function logBotEvent(
  mode: EtoroMode,
  type: BotEventType,
  message: string,
  options: { symbol?: string; payload?: unknown } = {}
): Promise<void> {
  const line = `[bot:${mode}] ${type} ${options.symbol ?? ""} ${message}`;
  if (type === "ERROR" || type === "ORDER_REJECTED" || type === "ORDER_BLOCKED") {
    console.error(line, options.payload ?? "");
  } else {
    console.log(line, options.payload ?? "");
  }

  try {
    await prisma.botEvent.create({
      data: {
        mode,
        type,
        symbol: options.symbol,
        message,
        // Round-trip through JSON to strip undefineds and non-serializable values.
        payload:
          options.payload === undefined
            ? undefined
            : JSON.parse(JSON.stringify(options.payload)),
      },
    });
  } catch (err) {
    console.warn("[bot] failed to persist BotEvent:", (err as Error).message);
  }
}
