"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

type JobType = "signals" | "morning-brief";

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
              {result.job === "signals" ? "Signals" : "Morning brief"} completed
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Ran at: {new Date(result.data.ranAt).toLocaleString()}
          </div>
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
