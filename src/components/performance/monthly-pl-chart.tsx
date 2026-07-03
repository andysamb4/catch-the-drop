"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/performance/chart-tooltip";
import type { PerformanceStats } from "@/lib/performance-dto";

export function MonthlyPlChart({ data }: { data: PerformanceStats["monthlyPL"] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Monthly P/L shows up once you&apos;ve closed a trade.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tickFormatter={(v) => new Date(`${v}-01`).toLocaleDateString(undefined, { month: "short" })}
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
          content={<ChartTooltip formatValue={(v) => `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`} />}
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {data.map((entry) => (
            <Cell key={entry.month} fill={entry.total >= 0 ? "var(--primary)" : "var(--destructive)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
