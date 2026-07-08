"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface SyncResponse {
  syncedAt: string;
  watchlist: {
    listsImported: string[];
    created: number;
    reactivated: number;
    unchanged: number;
    skippedNonStock: number;
  };
  portfolio: {
    positions: number;
    credit: number;
    unrealizedPnl: number;
  };
}

export function EtoroSync({ configured }: { configured: boolean }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/etoro/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Sync failed: ${res.status}`);
      }
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Set the ETORO_API_KEY and ETORO_USER_KEY environment variables to enable syncing.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Pull your eToro watchlists and live portfolio into the app.
        </p>
        <Button onClick={runSync} disabled={loading} variant="outline" size="sm">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sync eToro
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Sync completed</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Lists: {result.watchlist.listsImported.join(", ")}
          </div>
          <div className="text-xs">
            Watchlist: {result.watchlist.created} added, {result.watchlist.reactivated} reactivated,{" "}
            {result.watchlist.unchanged} already present
            {result.watchlist.skippedNonStock > 0 &&
              `, ${result.watchlist.skippedNonStock} skipped (not stock/ETF)`}
          </div>
          <div className="text-xs">
            Portfolio: {result.portfolio.positions} positions, ${result.portfolio.credit.toFixed(2)}{" "}
            cash, ${result.portfolio.unrealizedPnl.toFixed(2)} unrealized P&L
          </div>
        </div>
      )}
    </div>
  );
}
