"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  positionSizeUsd: number;
  maxOpenPositions: number;
  minSignalMovePct: number;
};

export function SettingsForm({ positionSizeUsd, maxOpenPositions, minSignalMovePct }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    positionSizeUsd: String(positionSizeUsd),
    maxOpenPositions: String(maxOpenPositions),
    minSignalMovePct: String(minSignalMovePct),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSizeUsd: Number(form.positionSizeUsd),
          maxOpenPositions: Number(form.maxOpenPositions),
          minSignalMovePct: Number(form.minSignalMovePct),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Something went wrong.");
        return;
      }

      toast.success("Settings saved");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="positionSizeUsd">Position size per signal ($)</Label>
        <Input
          id="positionSizeUsd"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={form.positionSizeUsd}
          onChange={(e) => setForm((f) => ({ ...f, positionSizeUsd: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="maxOpenPositions">Max open positions</Label>
        <Input
          id="maxOpenPositions"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={form.maxOpenPositions}
          onChange={(e) => setForm((f) => ({ ...f, maxOpenPositions: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="minSignalMovePct">Min signal move to fire (%)</Label>
        <Input
          id="minSignalMovePct"
          type="number"
          inputMode="decimal"
          min={0.1}
          step={0.1}
          required
          value={form.minSignalMovePct}
          onChange={(e) => setForm((f) => ({ ...f, minSignalMovePct: e.target.value }))}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
