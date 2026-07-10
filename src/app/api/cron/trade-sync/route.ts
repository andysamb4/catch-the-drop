import { NextRequest, NextResponse } from "next/server";
import { reconcilePositions } from "@/lib/auto-trade";
import { getEtoroMode } from "@/lib/trading-config";

export const maxDuration = 120;

// Close-detection poll. eToro closes positions server-side when the attached
// take-profit hits, so this cron only reconciles: pending orders -> fills,
// vanished open positions -> closed with realized P&L from trade history.
// Scheduled every 30 minutes around US market hours (see vercel.json); the
// sandbox page's refresh triggers the same reconcile for the demo account.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = getEtoroMode();
  const startedAt = Date.now();

  try {
    const result = await reconcilePositions(mode);
    return NextResponse.json({
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      mode,
      open: result.open,
      pending: result.stillPending,
      filled: result.filled,
      closed: result.closed,
      failed: result.failed,
      etoroOpenPositions: result.portfolio.positions.length,
      results: [],
    });
  } catch (err) {
    return NextResponse.json(
      { ranAt: new Date().toISOString(), mode, error: (err as Error).message },
      { status: 500 }
    );
  }
}
