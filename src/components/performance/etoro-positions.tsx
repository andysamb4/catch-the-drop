import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ComingSoon } from "@/components/layout/coming-soon";
import { StatTile } from "@/components/performance/stat-tile";

export type EtoroPositionRow = {
  id: string;
  symbol: string;
  name: string;
  isBuy: boolean;
  leverage: number;
  investedUsd: number;
  unrealizedPnl: number | null;
};

export type EtoroAccountSummary = {
  credit: number;
  unrealizedPnl: number;
  syncedAt: string;
};

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function EtoroPositions({
  account,
  positions,
}: {
  account: EtoroAccountSummary | null;
  positions: EtoroPositionRow[];
}) {
  if (!account || positions.length === 0) {
    return (
      <ComingSoon
        icon={Landmark}
        title="No eToro data yet"
        description="Run a sync from Settings → eToro to pull in your live portfolio."
      />
    );
  }

  const invested = positions.reduce((sum, p) => sum + p.investedUsd, 0);
  const sorted = [...positions].sort((a, b) => b.investedUsd - a.investedUsd);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Invested" value={usd(invested)} />
        <StatTile
          label="Unrealized P&L"
          value={usd(account.unrealizedPnl)}
          tone={account.unrealizedPnl >= 0 ? "positive" : "negative"}
        />
        <StatTile label="Cash" value={usd(account.credit)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Ticker</TableHead>
              <TableHead className="text-right">Invested</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">P&L %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => {
              const pnl = p.unrealizedPnl;
              const pnlPct = pnl !== null && p.investedUsd > 0 ? (pnl / p.investedUsd) * 100 : null;
              const pnlClass =
                pnl === null ? "text-muted-foreground" : pnl >= 0 ? "text-primary" : "text-destructive";
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.symbol}</span>
                      {!p.isBuy && <Badge variant="destructive">SHORT</Badge>}
                      {p.leverage > 1 && (
                        <Badge variant="outline" className="text-muted-foreground">
                          x{p.leverage}
                        </Badge>
                      )}
                    </div>
                    <div className="max-w-[140px] truncate text-xs text-muted-foreground">
                      {p.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{usd(p.investedUsd)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${pnlClass}`}>
                    {pnl === null ? "—" : usd(pnl)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${pnlClass}`}>
                    {pnlPct === null ? "—" : `${pnlPct > 0 ? "+" : ""}${pnlPct.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Last synced {new Date(account.syncedAt).toLocaleString()}
      </p>
    </div>
  );
}
