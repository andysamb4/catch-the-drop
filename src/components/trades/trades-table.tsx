"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreVertical, Plus, Receipt, Search } from "lucide-react";
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
import { TradeFormDialog } from "@/components/trades/trade-form-dialog";
import { LogExitDialog } from "@/components/trades/log-exit-dialog";
import type { TradeDTO } from "@/lib/trade-dto";

type SortKey = "entryDate" | "symbol" | "realizedPL";
type WatchlistOption = { symbol: string; name: string };

export function TradesTable({
  initialTrades,
  watchlist,
}: {
  initialTrades: TradeDTO[];
  watchlist: WatchlistOption[];
}) {
  const [trades, setTrades] = useState(initialTrades);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("entryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [logOpen, setLogOpen] = useState(false);
  const [exitTrade, setExitTrade] = useState<TradeDTO | null>(null);
  const [deleteTrade, setDeleteTrade] = useState<TradeDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function refresh() {
    const res = await fetch("/api/trades");
    if (res.ok) setTrades(await res.json());
  }

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
    let result = trades.filter((t) => {
      const matchesQuery =
        !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "entryDate") cmp = a.entryDate.localeCompare(b.entryDate);
      else if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === "realizedPL") cmp = (a.realizedPL ?? 0) - (b.realizedPL ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [trades, search, statusFilter, sortKey, sortDir]);

  async function handleDeleteConfirm() {
    if (!deleteTrade) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/trades/${deleteTrade.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${deleteTrade.symbol} trade deleted`);
      setDeleteTrade(null);
      await refresh();
    } catch {
      toast.error("Couldn't delete that trade.");
    } finally {
      setIsDeleting(false);
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
            placeholder="Search ticker or name"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={() => setLogOpen(true)}
          aria-label="Log trade"
          disabled={watchlist.length === 0}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {trades.length === 0 ? (
        <ComingSoon
          icon={Receipt}
          title="No trades logged yet"
          description="When you execute a signal on eToro, log it here to track P/L and holding period."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <SortHeader label="Date" sortKeyValue="entryDate" />
                </TableHead>
                <TableHead>
                  <SortHeader label="Ticker" sortKeyValue="symbol" />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="P/L" sortKeyValue="realizedPL" />
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.entryDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Link href={`/trades/${t.id}`} className="flex items-center gap-2">
                      <span className="font-semibold">{t.symbol}</span>
                      <Badge variant={t.direction === "LONG" ? "default" : "destructive"}>
                        {t.direction}
                      </Badge>
                      {t.status === "OPEN" && <Badge variant="outline">OPEN</Badge>}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.realizedPL != null ? (
                      <span className={t.realizedPL >= 0 ? "text-primary" : "text-destructive"}>
                        {t.realizedPL >= 0 ? "+" : ""}
                        {t.realizedPL.toFixed(2)}
                      </span>
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
                        <DropdownMenuItem render={<Link href={`/trades/${t.id}`} />}>
                          View detail
                        </DropdownMenuItem>
                        {t.status === "OPEN" && (
                          <DropdownMenuItem onClick={() => setExitTrade(t)}>Log exit</DropdownMenuItem>
                        )}
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTrade(t)}>
                          Delete
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

      <TradeFormDialog watchlist={watchlist} open={logOpen} onOpenChange={setLogOpen} onSaved={refresh} />
      <LogExitDialog trade={exitTrade} open={!!exitTrade} onOpenChange={(open) => !open && setExitTrade(null)} onSaved={refresh} />

      <AlertDialog open={!!deleteTrade} onOpenChange={(open) => !open && setDeleteTrade(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteTrade?.symbol} trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trade record, including P/L history. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDeleteConfirm}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
