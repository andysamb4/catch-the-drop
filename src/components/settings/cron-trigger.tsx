"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

type JobType = "signals" | "morning-brief" | "trade-sync";

interface JobResult {
  symbol?: string;
  status: string;
  signal?: string;
}

interface Response {
  ranAt: string;
  results: JobResult[];
  note?: string;
  briefDate?: string;
  // Signals job only
  durationMs?: number;
  total?: number;
  signalCount?: number;
  errorCount?: number;
  ordersPlaced?: number;
  // Trade-sync job only
  mode?: string;
  open?: number;
  pending?: number;
  filled?: number;
  closed?: number;
}

export function CronTrigger() {
  const [loading, setLoading] = useState<JobType | null>(null);
  const [result, setResult] = useState<{ job: JobType; data: Response } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runJob = async (job: JobType) => {
    setLoading(job);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/cron/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to run ${job}: ${res.status}`);
      }

      const data = await res.json();
      setResult({ job, data });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          onClick={() => runJob("signals")}
          disabled={loading !== null}
          variant="outline"
          size="sm"
        >
          {loading === "signals" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Run signals
        </Button>
        <Button
          onClick={() => runJob("morning-brief")}
          disabled={loading !== null}
          variant="outline"
          size="sm"
        >
          {loading === "morning-brief" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Run morning brief
        </Button>
        <Button
          onClick={() => runJob("trade-sync")}
          disabled={loading !== null}
          variant="outline"
          size="sm"
        >
          {loading === "trade-sync" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Run trade sync
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
            <span className="font-medium">
              {result.job === "signals"
                ? "Signals"
                : result.job === "trade-sync"
                  ? "Trade sync"
                  : "Morning brief"}{" "}
              completed
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Ran at: {new Date(result.data.ranAt).toLocaleString()}
          </div>
          {result.data.total != null && (
            <div className="text-xs text-muted-foreground">
              Scanned {result.data.total} tickers in{" "}
              {Math.round((result.data.durationMs ?? 0) / 1000)}s &middot;{" "}
              {result.data.signalCount} signal{result.data.signalCount === 1 ? "" : "s"}
              {(result.data.errorCount ?? 0) > 0 && (
                <span className="font-medium text-destructive">
                  {" "}
                  &middot; {result.data.errorCount} error
                  {result.data.errorCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
          {result.job === "trade-sync" && result.data.mode != null && (
            <div className="text-xs text-muted-foreground">
              Mode {result.data.mode} &middot; {result.data.open ?? 0} open &middot;{" "}
              {result.data.pending ?? 0} pending &middot; {result.data.filled ?? 0} filled &middot;{" "}
              {result.data.closed ?? 0} closed
            </div>
          )}
          {result.job === "signals" && (result.data.ordersPlaced ?? 0) > 0 && (
            <div className="text-xs text-muted-foreground">
              {result.data.ordersPlaced} order{result.data.ordersPlaced === 1 ? "" : "s"} placed
            </div>
          )}
          {result.data.note && (
            <div className="text-xs text-muted-foreground">{result.data.note}</div>
          )}
          {result.data.briefDate && (
            <div className="text-xs text-muted-foreground">Brief date: {result.data.briefDate}</div>
          )}
          <div className="space-y-1">
            {result.data.results.slice(0, 5).map((r) => (
              <div key={r.symbol} className="text-xs">
                <span className="font-medium">{r.symbol}:</span> {r.status}
                {r.signal && ` (${r.signal})`}
              </div>
            ))}
            {result.data.results.length > 5 && (
              <div className="text-xs text-muted-foreground">
                ... and {result.data.results.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
