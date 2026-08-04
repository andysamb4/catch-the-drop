"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, History, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ComingSoon } from "@/components/layout/coming-soon";
import type { SignalDTO } from "@/lib/signal-dto";

type SortKey = "date" | "symbol" | "streakLength" | "cumulativeMovePct";

export function SignalsTable({ signals }: { signals: SignalDTO[] }) {
  const [search, setSearch] = useState("");
  // The scan is long-only, so SHORT rows are frozen history: default the view to
  // BUY and keep the archive one click away rather than dropping it.
  const [typeFilter, setTypeFilter] = useState("BUY");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = signals.filter((s) => {
      const matchesQuery =
        !q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || s.type === typeFilter;
      return matchesQuery && matchesType;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === "streakLength") cmp = a.streakLength - b.streakLength;
      else if (sortKey === "cumulativeMovePct")
        cmp = Math.abs(a.cumulativeMovePct) - Math.abs(b.cumulativeMovePct);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [signals, search, typeFilter, sortKey, sortDir]);

  const showsLegacy = useMemo(() => visible.some((s) => s.type === "SHORT"), [visible]);

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const isActive = sortKey === sortKeyValue;
    const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyValue)}
        className="flex items-center gap-1 font-medium text-foreground"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker or name"
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "BUY")}>
          <SelectTrigger className="w-36 shrink-0">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BUY">BUY</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="SHORT">SHORT (archived)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showsLegacy && (
        <p className="text-xs text-muted-foreground">
          SHORT signals are archived history. The strategy went long-only on 4 Aug 2026 — the
          nightly scan no longer generates them and the bot no longer trades them.
        </p>
      )}

      {signals.length === 0 ? (
        <ComingSoon
          icon={History}
          title="No signals yet"
          description="Once the nightly scan finds a 3-day drop on your watchlist, it'll show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <SortHeader label="Date" sortKeyValue="date" />
                </TableHead>
                <TableHead>
                  <SortHeader label="Ticker" sortKeyValue="symbol" />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Streak" sortKeyValue="streakLength" />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Move" sortKeyValue="cumulativeMovePct" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((s) => (
                <TableRow key={s.id} className={s.type === "SHORT" ? "opacity-60" : undefined}>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.symbol}</span>
                      {/* Archived direction: one muted badge rather than BUY's solid
                          one, so a legacy short can never read as actionable. */}
                      {s.type === "BUY" ? (
                        <Badge>BUY</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          SHORT &middot; archived
                        </Badge>
                      )}
                      {s.strategyFit === "POOR" && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Poor fit
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {s.streakLength}d
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.cumulativeMovePct > 0 ? "+" : ""}
                    {s.cumulativeMovePct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
