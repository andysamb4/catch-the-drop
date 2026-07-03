"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/performance/chart-tooltip";
import type { PerformanceStats } from "@/lib/performance-dto";

export function StreakEffectivenessChart({ data }: { data: PerformanceStats["byStreakLength"] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Link trades to the signal that triggered them to see this breakdown.
      </p>
    );
  }

  const chartData = data.map((d) => ({ ...d, label: `${d.streakLength}d` }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltip formatValue={(v) => `${v >= 0 ? "+" : ""}$${v.toFixed(2)} avg`} />
          }
        />
        <Bar dataKey="avgPL" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {chartData.map((entry) => (
            <Cell key={entry.label} fill={entry.avgPL >= 0 ? "var(--primary)" : "var(--destructive)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
