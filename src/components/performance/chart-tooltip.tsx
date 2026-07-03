type TooltipEntry = { value?: number | string; color?: string; name?: string };

// Value leads, label follows per the dataviz skill's tooltip guidance; text stays in
// text tokens (never the series color) and the value uses tabular figures.
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = (v) => String(v),
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const value = typeof entry.value === "number" ? entry.value : Number(entry.value);

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p
        className={`font-semibold tabular-nums ${value >= 0 ? "text-primary" : "text-destructive"}`}
      >
        {formatValue(value)}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
