"use client";

import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriceHistoryChart } from "@/components/yo-yo-hunter/price-history-chart";
import type { DailyClose } from "@/lib/yahoo-finance";

type Result = {
  symbol: string;
  yoyoScore: number;
  cumulativeReturnPct: number;
  months: number;
  verdict: string | null;
  verdictError: string | null;
  priceHistory: DailyClose[];
};

export function YoYoHunterForm({ watchlistSymbols }: { watchlistSymbols: string[] }) {
  const [symbol, setSymbol] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/yo-yo-hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setResult(data);
    } catch {
      setError("Couldn't reach the analysis service.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Paste or pick a ticker. Analyzes ~12 months of daily closes for 3-day mean-reversion fit.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. AAPL"
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !symbol.trim()}>
          {isLoading ? "Analyzing..." : "Analyze"}
        </Button>
      </form>

      {watchlistSymbols.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {watchlistSymbols.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSymbol(s)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card className="rounded-2xl">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Yo-yo score</p>
                <p className="text-xl font-semibold">{result.yoyoScore}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">12mo return</p>
                <p
                  className={`text-xl font-semibold ${
                    result.cumulativeReturnPct >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {result.cumulativeReturnPct >= 0 ? "+" : ""}
                  {result.cumulativeReturnPct.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Data</p>
                <p className="text-xl font-semibold">{result.months}mo</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl">
            <CardContent className="pt-4">
              <PriceHistoryChart data={result.priceHistory} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">{result.symbol} verdict</span>
                <Badge variant="outline">AI</Badge>
              </div>
              {result.verdict ? (
                <p className="text-sm text-foreground/80">{result.verdict}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {result.verdictError ?? "No verdict available."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
