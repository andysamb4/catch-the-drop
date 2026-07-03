"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { LogExitDialog } from "@/components/trades/log-exit-dialog";
import type { TradeDTO } from "@/lib/trade-dto";

export function TradeDetailActions({ trade }: { trade: TradeDTO }) {
  const router = useRouter();
  const [exitOpen, setExitOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${trade.symbol} trade deleted`);
      router.push("/trades");
      router.refresh();
    } catch {
      toast.error("Couldn't delete that trade.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex gap-2">
      {trade.status === "OPEN" && (
        <Button className="flex-1" onClick={() => setExitOpen(true)}>
          Log exit
        </Button>
      )}
      <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(true)}>
        Delete
      </Button>

      <LogExitDialog
        trade={trade}
        open={exitOpen}
        onOpenChange={setExitOpen}
        onSaved={() => {
          router.refresh();
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {trade.symbol} trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trade record, including P/L history. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
