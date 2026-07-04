"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComingSoon } from "@/components/layout/coming-soon";
import { StatTile } from "@/components/performance/stat-tile";
import { EquityCurveChart } from "@/components/performance/equity-curve-chart";
import { StreakEffectivenessChart } from "@/components/performance/streak-effectiveness-chart";
import { runBacktest, computeBacktestStats, type BacktestTickerInput } from "@/lib/backtest";

function fmtMoney(v: number) {
  return `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`;
}

function fmtPct(v: number) {
  return `${v.toFixed(0)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type Props = {
  tickers: BacktestTickerInput[];
  minSignalMovePct: number;
  positionSizeUsd: number;
};

export function BacktestDashboard({ tickers, minSignalMovePct, positionSizeUsd }: Props) {
  const [minStreakLength, setMinStreakLength] = useState(3);
  const [holdingPeriodDays, setHoldingPeriodDays] = useState(3);
  const [tickerFilter, setTickerFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");

  const sectors = useMemo(
    () => Array.from(new Set(tickers.map((t) => t.sector).filter((s): s is string => !!s))).sort(),
    [tickers]
  );

  const totalBars = useMemo(() => tickers.reduce((sum, t) => sum + t.bars.length, 0), [tickers]);

  const dateRange = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const t of tickers) {
      for (const bar of t.bars) {
        if (!min || bar.date < min) min = bar.date;
        if (!max || bar.date > max) max = bar.date;
      }
    }
    return { min, max };
  }, [tickers]);

  const allTrades = useMemo(
    () =>
      runBacktest(tickers, {
        minStreakLength,
        holdingPeriodDays,
        minMovePct: minSignalMovePct,
        positionSizeUsd,
      }),
    [tickers, minStreakLength, holdingPeriodDays, minSignalMovePct, positionSizeUsd]
  );

  const filteredTrades = useMemo(
    () =>
      allTrades.filter((t) => {
        const matchesTicker = tickerFilter === "all" || t.symbol === tickerFilter;
        const matchesSector = sectorFilter === "all" || t.sector === sectorFilter;
        return matchesTicker && matchesSector;
      }),
    [allTrades, tickerFilter, sectorFilter]
  );

  const stats = useMemo(() => computeBacktestStats(filteredTrades), [filteredTrades]);

  if (totalBars === 0) {
    return (
      <ComingSoon
        icon={FlaskConical}
        title="No price history yet"
        description="The backtest needs a few weeks of nightly bars to accumulate before it can simulate anything."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-dashed shadow-none">
        <CardContent className="space-y-1 py-3 text-xs text-muted-foreground">
          <p>
            Based on <span className="font-medium text-foreground">{totalBars}</span> self-built
            daily bars across {tickers.length} tickers
            {dateRange.min && dateRange.max && (
              <>
                {" "}
                from <span className="font-medium text-foreground">{fmtDate(dateRange.min)}</span>{" "}
                to <span className="font-medium text-foreground">{fmtDate(dateRange.max)}</span>
              </>
            )}
            .
          </p>
          <p>
            One quote per weekday, self-built (no vendor history) — treat results as
            directional, not conclusive, until more history accumulates.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Strategy parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minStreakLength">Min streak length (days)</Label>
              <Input
                id="minStreakLength"
                type="number"
                min={2}
                max={10}
                step={1}
                value={minStreakLength}
                onChange={(e) => setMinStreakLength(Math.max(2, Number(e.target.value) || 2))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holdingPeriodDays">Holding period (days)</Label>
              <Input
                id="holdingPeriodDays"
                type="number"
                min={1}
                max={20}
                step={1}
                value={holdingPeriodDays}
                onChange={(e) => setHoldingPeriodDays(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Filtered on Settings&apos; minimum signal move: {minSignalMovePct}%
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Select value={tickerFilter} onValueChange={(value) => setTickerFilter(value ?? "all")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All tickers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tickers</SelectItem>
            {tickers.map((t) => (
              <SelectItem key={t.symbol} value={t.symbol}>
                {t.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sectors.length > 0 && (
          <Select value={sectorFilter} onValueChange={(value) => setSectorFilter(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {stats.totalTrades === 0 ? (
        <ComingSoon
          icon={FlaskConical}
          title="No simulated trades"
          description="No streak matching these parameters completed within the available history. Try a shorter streak length or holding period."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total trades" value={String(stats.totalTrades)} />
            <StatTile label="Win rate" value={stats.winRate != null ? fmtPct(stats.winRate) : "—"} />
            <StatTile
              label="Avg P/L per trade"
              value={stats.avgPLPerTrade != null ? fmtMoney(stats.avgPLPerTrade) : "—"}
              tone={
                stats.avgPLPerTrade != null ? (stats.avgPLPerTrade >= 0 ? "positive" : "negative") : "neutral"
              }
            />
            <StatTile
              label="Cumulative P/L"
              value={fmtMoney(stats.totalPL)}
              tone={stats.totalPL >= 0 ? "positive" : "negative"}
            />
          </div>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Simulated equity curve</CardTitle>
            </CardHeader>
            <CardContent>
              <EquityCurveChart data={stats.equityCurve} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Avg P/L by streak length</CardTitle>
            </CardHeader>
            <CardContent>
              <StreakEffectivenessChart data={stats.byStreakLength} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Long vs short</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {(["LONG", "SHORT"] as const).map((direction) => {
                const d = stats.byDirection[direction];
                return (
                  <div key={direction} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {direction === "LONG" ? "Long" : "Short"} ({d.count})
                    </p>
                    <p
                      className={`text-lg font-semibold ${
                        d.avgPL != null && d.avgPL >= 0 ? "text-primary" : d.avgPL != null ? "text-destructive" : ""
                      }`}
                    >
                      {d.avgPL != null ? fmtMoney(d.avgPL) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.winRate != null ? `${fmtPct(d.winRate)} win rate` : "No trades"}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
