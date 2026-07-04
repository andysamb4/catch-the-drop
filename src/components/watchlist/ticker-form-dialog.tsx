"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WatchlistItemDTO } from "@/lib/watchlist-dto";

type Props = {
  mode: "add" | "edit";
  item?: WatchlistItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
};

const EMPTY_FORM = { symbol: "", name: "", sector: "", notes: "", strategyFit: "AUTO" };

export function TickerFormDialog({ mode, item, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && item) {
      setForm({
        symbol: item.symbol,
        name: item.name,
        sector: item.sector ?? "",
        notes: item.notes ?? "",
        strategyFit: item.strategyFitManual && item.strategyFit ? item.strategyFit : "AUTO",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, item]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const url = mode === "add" ? "/api/watchlist" : `/api/watchlist/${item?.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const body =
        mode === "add"
          ? { symbol: form.symbol, name: form.name, sector: form.sector, notes: form.notes }
          : { name: form.name, sector: form.sector, notes: form.notes, strategyFit: form.strategyFit };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Something went wrong.");
        return;
      }

      toast.success(mode === "add" ? `${form.symbol.toUpperCase()} added to watchlist` : "Ticker updated");
      onOpenChange(false);
      await onSaved();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add ticker" : `Edit ${item?.symbol}`}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Track a new symbol for 3-day drop and climb signals."
              : "Update the details for this watchlist ticker."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "add" && (
            <div className="space-y-2">
              <Label htmlFor="symbol">Ticker symbol</Label>
              <Input
                id="symbol"
                autoFocus
                required
                placeholder="e.g. GME"
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              required
              placeholder="e.g. GameStop Corp."
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sector">Sector</Label>
            <Input
              id="sector"
              placeholder="e.g. Retail"
              value={form.sector}
              onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {mode === "edit" && (
            <div className="space-y-2">
              <Label htmlFor="strategyFit">Strategy fit</Label>
              <Select
                value={form.strategyFit}
                onValueChange={(value) => setForm((f) => ({ ...f, strategyFit: value ?? "AUTO" }))}
              >
                <SelectTrigger id="strategyFit">
                  <SelectValue placeholder="Auto (from yo-yo score)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Auto (from yo-yo score)</SelectItem>
                  <SelectItem value="GOOD">Good</SelectItem>
                  <SelectItem value="MODERATE">Moderate</SelectItem>
                  <SelectItem value="POOR">Poor</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Auto derives fit from the nightly yo-yo score. Override if you know this ticker
                trends rather than ranges.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : mode === "add" ? "Add ticker" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
