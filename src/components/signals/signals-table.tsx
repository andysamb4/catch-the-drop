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
  const [typeFilter, setTypeFilter] = useState("all");
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
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="BUY">BUY</SelectItem>
            <SelectItem value="SHORT">SHORT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {signals.length === 0 ? (
        <ComingSoon
          icon={History}
          title="No signals yet"
          description="Once the nightly scan finds 3-day streaks on your watchlist, they'll show up here."
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
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.symbol}</span>
                      <Badge variant={s.type === "BUY" ? "default" : "destructive"}>
                        {s.type}
                      </Badge>
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
