"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComingSoon } from "@/components/layout/coming-soon";
import { StatTile } from "@/components/performance/stat-tile";
import { EquityCurveChart } from "@/components/performance/equity-curve-chart";
import { MonthlyPlChart } from "@/components/performance/monthly-pl-chart";
import { StreakEffectivenessChart } from "@/components/performance/streak-effectiveness-chart";
import { computePerformanceStats } from "@/lib/performance-dto";
import type { TradeDTO } from "@/lib/trade-dto";

function fmtMoney(v: number) {
  return `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`;
}

function fmtPct(v: number) {
  return `${v.toFixed(0)}%`;
}

export function PerformanceDashboard({ trades }: { trades: TradeDTO[] }) {
  const [sector, setSector] = useState("all");

  const sectors = useMemo(
    () => Array.from(new Set(trades.map((t) => t.sector).filter((s): s is string => !!s))).sort(),
    [trades]
  );

  const filtered = useMemo(
    () => (sector === "all" ? trades : trades.filter((t) => t.sector === sector)),
    [trades, sector]
  );

  const stats = useMemo(() => computePerformanceStats(filtered), [filtered]);

  if (trades.length === 0) {
    return (
      <ComingSoon
        icon={BarChart3}
        title="No trades yet"
        description="Performance stats and charts show up once you've logged and closed a few trades."
      />
    );
  }

  return (
    <div className="space-y-4">
      {sectors.length > 0 && (
        <Select value={sector} onValueChange={(value) => setSector(value ?? "all")}>
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

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Total realized P/L"
          value={fmtMoney(stats.totalRealizedPL)}
          tone={stats.totalRealizedPL >= 0 ? "positive" : "negative"}
        />
        <StatTile label="Win rate" value={stats.winRate != null ? fmtPct(stats.winRate) : "—"} />
        <StatTile
          label="Avg P/L per trade"
          value={stats.avgPLPerTrade != null ? fmtMoney(stats.avgPLPerTrade) : "—"}
          tone={stats.avgPLPerTrade != null ? (stats.avgPLPerTrade >= 0 ? "positive" : "negative") : "neutral"}
        />
        <StatTile
          label="Avg holding period"
          value={stats.avgHoldingDays != null ? `${stats.avgHoldingDays.toFixed(1)}d` : "—"}
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Equity curve</CardTitle>
        </CardHeader>
        <CardContent>
          <EquityCurveChart data={stats.equityCurve} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Monthly P/L</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyPlChart data={stats.monthlyPL} />
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
                <p className={`text-lg font-semibold ${d.avgPL != null && d.avgPL >= 0 ? "text-primary" : d.avgPL != null ? "text-destructive" : ""}`}>
                  {d.avgPL != null ? fmtMoney(d.avgPL) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.winRate != null ? `${fmtPct(d.winRate)} win rate` : "No closed trades"}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {(stats.bestTickers.length > 0 || stats.worstTickers.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm">Best tickers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.bestTickers.map((t) => (
                <div key={t.symbol} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.symbol}</span>
                  <span className="text-primary tabular-nums">{fmtMoney(t.totalPL)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm">Worst tickers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.worstTickers.map((t) => (
                <div key={t.symbol} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.symbol}</span>
                  <span className="text-destructive tabular-nums">{fmtMoney(t.totalPL)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
