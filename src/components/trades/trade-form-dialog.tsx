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

type WatchlistOption = { symbol: string; name: string };
type SignalOption = {
  id: string;
  date: string;
  type: "BUY" | "SHORT";
  streakLength: number;
  cumulativeMovePct: number;
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  symbol: "",
  direction: "LONG" as "LONG" | "SHORT",
  entryPrice: "",
  quantity: "",
  entryDate: today(),
  signalId: "none",
  notes: "",
};

export function TradeFormDialog({
  watchlist,
  open,
  onOpenChange,
  onSaved,
}: {
  watchlist: WatchlistOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [signalOptions, setSignalOptions] = useState<SignalOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  useEffect(() => {
    if (!form.symbol) {
      setSignalOptions([]);
      return;
    }
    fetch(`/api/signals?symbol=${encodeURIComponent(form.symbol)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setSignalOptions)
      .catch(() => setSignalOptions([]));
  }, [form.symbol]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol,
          direction: form.direction,
          entryPrice: form.entryPrice,
          quantity: form.quantity,
          entryDate: form.entryDate,
          signalId: form.signalId === "none" ? null : form.signalId,
          notes: form.notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Couldn't log that trade.");
        return;
      }

      toast.success(`${form.symbol} trade logged`);
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
          <DialogTitle>Log trade</DialogTitle>
          <DialogDescription>Record a trade you already executed on eToro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="trade-symbol">Ticker</Label>
              <Select
                value={form.symbol}
                onValueChange={(value) => setForm((f) => ({ ...f, symbol: value ?? "", signalId: "none" }))}
              >
                <SelectTrigger id="trade-symbol">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {watchlist.map((w) => (
                    <SelectItem key={w.symbol} value={w.symbol}>
                      {w.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade-direction">Direction</Label>
              <Select
                value={form.direction}
                onValueChange={(value) => setForm((f) => ({ ...f, direction: (value ?? "LONG") as "LONG" | "SHORT" }))}
              >
                <SelectTrigger id="trade-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LONG">Long</SelectItem>
                  <SelectItem value="SHORT">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="entryPrice">Entry price</Label>
              <Input
                id="entryPrice"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.entryPrice}
                onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                min="0"
                required
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entryDate">Entry date</Label>
            <Input
              id="entryDate"
              type="date"
              required
              value={form.entryDate}
              onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-signal">Signal that triggered it</Label>
            <Select
              value={form.signalId}
              onValueChange={(value) => setForm((f) => ({ ...f, signalId: value ?? "none" }))}
            >
              <SelectTrigger id="trade-signal">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {signalOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} &middot;{" "}
                    {s.type} ({s.streakLength}d, {s.cumulativeMovePct > 0 ? "+" : ""}
                    {s.cumulativeMovePct.toFixed(1)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-notes">Notes</Label>
            <Textarea
              id="trade-notes"
              placeholder="Optional"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting || !form.symbol}>
              {isSubmitting ? "Saving..." : "Log trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
