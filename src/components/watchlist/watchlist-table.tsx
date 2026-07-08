"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreVertical, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ComingSoon } from "@/components/layout/coming-soon";
import { LayoutList } from "lucide-react";
import { TickerFormDialog } from "@/components/watchlist/ticker-form-dialog";
import type { WatchlistItemDTO } from "@/lib/watchlist-dto";

type SortKey = "symbol" | "sector" | "yoyoScore" | "strategyFit" | "addedAt";

const STRATEGY_FIT_RANK: Record<string, number> = { GOOD: 3, MODERATE: 2, POOR: 1 };

const STRATEGY_FIT_LABEL: Record<string, string> = {
  GOOD: "Good",
  MODERATE: "Moderate",
  POOR: "Poor",
};

const STRATEGY_FIT_BADGE_VARIANT: Record<string, "default" | "outline" | "destructive"> = {
  GOOD: "default",
  MODERATE: "outline",
  POOR: "destructive",
};

export function WatchlistTable({ initialItems }: { initialItems: WatchlistItemDTO[] }) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [fitFilter, setFitFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("addedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<WatchlistItemDTO | null>(null);
  const [removeItem, setRemoveItem] = useState<WatchlistItemDTO | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const sectors = useMemo(
    () => Array.from(new Set(items.map((i) => i.sector).filter((s): s is string => !!s))).sort(),
    [items]
  );

  // Yo-yo score is an unbounded reversal count, so the meter shows each ticker
  // relative to the highest score currently on the list.
  const maxYoyoScore = useMemo(
    () => Math.max(1, ...items.map((i) => i.yoyoScore ?? 0)),
    [items]
  );

  async function refresh() {
    const res = await fetch("/api/watchlist");
    if (res.ok) setItems(await res.json());
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = items.filter((item) => {
      const matchesQuery =
        !q ||
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.sector?.toLowerCase().includes(q) ?? false);
      const matchesSector = sectorFilter === "all" || item.sector === sectorFilter;
      const matchesFit =
        fitFilter === "all" ||
        (fitFilter === "UNKNOWN" ? !item.strategyFit : item.strategyFit === fitFilter);
      return matchesQuery && matchesSector && matchesFit;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === "sector") cmp = (a.sector ?? "").localeCompare(b.sector ?? "");
      else if (sortKey === "yoyoScore") cmp = (a.yoyoScore ?? -1) - (b.yoyoScore ?? -1);
      else if (sortKey === "strategyFit")
        cmp = (STRATEGY_FIT_RANK[a.strategyFit ?? ""] ?? 0) - (STRATEGY_FIT_RANK[b.strategyFit ?? ""] ?? 0);
      else if (sortKey === "addedAt") cmp = a.addedAt.localeCompare(b.addedAt);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, search, sectorFilter, fitFilter, sortKey, sortDir]);

  async function handleRemoveConfirm() {
    if (!removeItem) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/watchlist/${removeItem.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${removeItem.symbol} removed from watchlist`);
      setRemoveItem(null);
      await refresh();
    } catch {
      toast.error("Couldn't remove that ticker. Try again.");
    } finally {
      setIsRemoving(false);
    }
  }

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
            placeholder="Search ticker, name, sector"
            className="pl-8"
          />
        </div>
        <Button size="icon" className="shrink-0 rounded-xl" onClick={() => setAddOpen(true)} aria-label="Add ticker">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2">
        {sectors.length > 0 && (
          <Select value={sectorFilter} onValueChange={(value) => setSectorFilter(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((sector) => (
                <SelectItem key={sector} value={sector}>
                  {sector}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={fitFilter} onValueChange={(value) => setFitFilter(value ?? "all")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All fits" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fits</SelectItem>
            <SelectItem value="GOOD">Good</SelectItem>
            <SelectItem value="MODERATE">Moderate</SelectItem>
            <SelectItem value="POOR">Poor</SelectItem>
            <SelectItem value="UNKNOWN">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <ComingSoon
          icon={LayoutList}
          title="Your watchlist is empty"
          description="Add a ticker to start tracking it for 3-day drop and climb signals."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <SortHeader label="Ticker" sortKeyValue="symbol" />
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <SortHeader label="Sector" sortKeyValue="sector" />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Yo-Yo" sortKeyValue="yoyoScore" />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Fit" sortKeyValue="strategyFit" />
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-semibold">{item.symbol}</div>
                    <div className="max-w-40 truncate text-xs text-muted-foreground">
                      {item.name}
                    </div>
                    {item.sector && (
                      <Badge variant="secondary" className="mt-1 sm:hidden">
                        {item.sector}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {item.sector ?? "—"}
                  </TableCell>
                  <TableCell>
                    {item.yoyoScore != null ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.round((item.yoyoScore / maxYoyoScore) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium tabular-nums">{item.yoyoScore}</span>
                      </div>
                    ) : (
                      <div className="text-right text-muted-foreground">—</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.strategyFit ? (
                      <Badge variant={STRATEGY_FIT_BADGE_VARIANT[item.strategyFit]}>
                        {STRATEGY_FIT_LABEL[item.strategyFit]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditItem(item)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setRemoveItem(item)}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TickerFormDialog
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={refresh}
      />
      <TickerFormDialog
        mode="edit"
        item={editItem}
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        onSaved={refresh}
      />

      <AlertDialog open={!!removeItem} onOpenChange={(open) => !open && setRemoveItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeItem?.symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              It&apos;ll stop appearing in signals and yo-yo scoring. Past signals and trades for
              this ticker are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isRemoving} onClick={handleRemoveConfirm}>
              {isRemoving ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
