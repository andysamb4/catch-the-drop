"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/performance/chart-tooltip";
import type { PerformanceStats } from "@/lib/performance-dto";

export function EquityCurveChart({ data }: { data: PerformanceStats["equityCurve"] }) {
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Close a few more trades to see your equity curve.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
          width={56}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatValue={(v) => `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="var(--primary)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--background)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
