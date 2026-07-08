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
import type { TradeDTO } from "@/lib/trade-dto";

const today = () => new Date().toISOString().slice(0, 10);

export function LogExitDialog({
  trade,
  open,
  onOpenChange,
  onSaved,
}: {
  trade: TradeDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState(today());
  const [exitReason, setExitReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setExitPrice("");
      setExitDate(today());
      setExitReason("");
    }
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trade) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitPrice, exitDate, exitReason }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Couldn't log that exit.");
        return;
      }

      toast.success(`${trade.symbol} closed`);
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
          <DialogTitle>Log exit for {trade?.symbol}</DialogTitle>
          <DialogDescription>
            Entered{" "}
            {trade
              ? `$${(trade.quantity * trade.entryPrice).toFixed(2)} (${trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh) @ $${trade.entryPrice.toFixed(2)}`
              : ""}{" "}
            on{" "}
            {trade ? new Date(trade.entryDate).toLocaleDateString() : ""}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exitPrice">Exit price</Label>
            <Input
              id="exitPrice"
              type="number"
              step="0.01"
              min="0"
              required
              autoFocus
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exitDate">Exit date</Label>
            <Input
              id="exitDate"
              type="date"
              required
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exitReason">Exit reason</Label>
            <Input
              id="exitReason"
              placeholder="e.g. bounce hit target, stopped out, thesis broke"
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Close trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
