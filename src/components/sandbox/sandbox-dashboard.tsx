"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SandboxData = {
  fetchedAt: string;
  etoroError: string | null;
  account: { cash: number; invested: number; unrealizedPnl: number } | null;
  openPositions: Array<{
    positionId: string;
    symbol: string;
    name: string;
    direction: string;
    investedUsd: number;
    entryPrice: number;
    takeProfitRate: number | null;
    currentRate: number | null;
    unrealizedPnl: number | null;
    openedAt: string;
    isBot: boolean;
    strategy: string | null;
  }>;
  pendingOrders: Array<{
    id: string;
    symbol: string;
    direction: string;
    requestedUsd: number;
    takeProfitRate: number | null;
    placedAt: string;
    strategy: string;
  }>;
  closedPositions: Array<{
    id: string;
    symbol: string;
    direction: string;
    investedUsd: number;
    entryPrice: number | null;
    closeRate: number | null;
    realizedPnl: number | null;
    closeReason: string | null;
    closedAt: string | null;
    strategy: string;
  }>;
  failedOrders: Array<{
    id: string;
    symbol: string;
    direction: string;
    error: string | null;
    placedAt: string;
    strategy: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    symbol: string | null;
    message: string;
    payload: unknown;
    createdAt: string;
  }>;
  status: {
    running: boolean;
    globalMode: string;
    lastPollAt: string | null;
    etoroReachable: boolean;
  };
  strategies: Array<{
    strategy: string;
    label: string;
    bankrollUsd: number;
    equity: number | null;
    realizedPnl: number;
    deployedUsd: number;
    openCount: number;
    closedCount: number;
    wins: number;
    winRate: number | null;
    nextTradeUsd: number | null;
  }>;
  config: {
    tradeSizeUsd: number;
    bankrollUsd: number | null;
    maxPositions: number;
    takeProfitPct: number;
    stopLossPct: number | null;
  };
};

// Whole dollars only — cents overflow the stat cards on phone-width screens.
const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const rate = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(0)}%`;

// Only the challenger gets a badge — the champion is the unmarked default, so
// its rows stay uncluttered. Legacy positions (strategy === null) get nothing.
function StrategyTag({ strategy }: { strategy: string | null }) {
  if (strategy !== "etf-mr") return null;
  return (
    <Badge variant="outline" className="border-sky-500/50 text-sky-700 dark:text-sky-400">
      ETF-MR
    </Badge>
  );
}

const time = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function pnlClass(pnl: number | null | undefined) {
  if (pnl == null) return "text-muted-foreground";
  return pnl >= 0 ? "text-primary" : "text-destructive";
}

// Everything on this page is demo/virtual money, and it must be impossible to
// mistake for a real-money view: amber frame, persistent banner, DEMO badges.
export function SandboxDashboard({ refreshMs }: { refreshMs: number }) {
  const [data, setData] = useState<SandboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sandbox", { cache: "no-store" });
      if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${res.statusText}`);
      setData((await res.json()) as SandboxData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh on the SANDBOX_REFRESH_MS cadence; a manual refresh restarts
  // the countdown so the next automatic fetch is a full interval away.
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(load, refreshMs);
  }, [load, refreshMs]);

  useEffect(() => {
    load();
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, startTimer]);

  const refreshNow = () => {
    startTimer();
    load();
  };

  const equity = data?.account
    ? data.account.cash + data.account.invested + data.account.unrealizedPnl
    : null;

  return (
    <div className="space-y-4">
      {/* Persistent demo banner — never rendered conditionally */}
      <div className="flex items-center gap-2 rounded-2xl border-2 border-amber-500 bg-amber-500/15 px-4 py-3 text-amber-700 dark:text-amber-400">
        <FlaskConical className="h-5 w-5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold uppercase tracking-wide">Demo — virtual funds</p>
          <p className="text-xs">
            eToro sandbox environment. Nothing on this page is real money.
          </p>
        </div>
        <Button onClick={refreshNow} disabled={loading} size="sm" variant="outline"
          className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
          {loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Refresh now
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {data?.etoroError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>eToro demo API unreachable: {data.etoroError}</span>
        </div>
      )}

      {!data && loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading demo account…
        </div>
      )}

      {data && (
        <>
          {/* Bot status */}
          <div className="rounded-2xl border border-amber-500/40 bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    data.status.running ? "bg-primary" : "bg-muted-foreground"
                  }`}
                />
                Bot {data.status.running ? "running" : "idle"}
              </span>
              <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                DEMO DATA
              </Badge>
              <span className="text-xs text-muted-foreground">
                Global mode: {data.status.globalMode}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Last poll {time(data.status.lastPollAt)} · Last refresh {time(data.fetchedAt)} ·{" "}
              {data.config.bankrollUsd != null
                ? `$${data.config.bankrollUsd} bankroll / ${data.config.maxPositions} slots`
                : `$${data.config.tradeSizeUsd}/trade`}{" "}
              · TP {(data.config.takeProfitPct * 100).toFixed(1)}%
              {data.config.stopLossPct != null &&
                ` · SL ${(data.config.stopLossPct * 100).toFixed(1)}%`}
            </p>
          </div>

          {/* Champion vs challenger — one isolated bankroll scorecard per strategy.
              Each pool's equity, realized P&L and win rate stand side by side so
              the A/B comparison is legible at a glance. */}
          {data.strategies.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Champion vs challenger</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.strategies.map((s) => (
                  <div key={s.strategy} className="rounded-2xl border border-amber-500/40 bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{s.label}</p>
                      <Badge
                        variant="outline"
                        className={
                          s.strategy === "etf-mr"
                            ? "border-sky-500/50 text-sky-700 dark:text-sky-400"
                            : "text-muted-foreground"
                        }
                      >
                        {s.strategy}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Equity</p>
                        <p
                          className={`font-semibold tabular-nums ${pnlClass(
                            s.equity != null ? s.equity - s.bankrollUsd : null
                          )}`}
                        >
                          {s.equity == null ? "—" : usd(s.equity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Realized P&L</p>
                        <p className={`font-semibold tabular-nums ${pnlClass(s.realizedPnl)}`}>
                          {usd(s.realizedPnl)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Win rate</p>
                        <p className="font-semibold tabular-nums">
                          {pct(s.winRate)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            ({s.wins}/{s.closedCount})
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Open / next</p>
                        <p className="font-semibold tabular-nums">
                          {s.openCount}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {s.nextTradeUsd == null
                              ? ""
                              : s.nextTradeUsd === 0
                                ? "· full"
                                : `· ${usd(s.nextTradeUsd)}`}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Virtual balance */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-amber-500/40 bg-card p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Virtual equity</p>
              <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">
                {equity == null ? "—" : usd(equity)}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-amber-500/40 bg-card p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">
                {data.account ? usd(data.account.cash) : "—"}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-amber-500/40 bg-card p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <p
                className={`mt-1 text-lg font-semibold tabular-nums sm:text-2xl ${pnlClass(data.account?.unrealizedPnl)}`}
              >
                {data.account ? usd(data.account.unrealizedPnl) : "—"}
              </p>
            </div>
          </div>

          {/* Pending orders (queued until next market open) */}
          {data.pendingOrders.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Pending orders</h2>
              <div className="overflow-hidden rounded-2xl border border-amber-500/40">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">TP target</TableHead>
                      <TableHead className="text-right">Placed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pendingOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <span className="font-semibold">{o.symbol}</span>{" "}
                          {o.direction === "SHORT" && <Badge variant="destructive">SHORT</Badge>}{" "}
                          <StrategyTag strategy={o.strategy} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{usd(o.requestedUsd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{rate(o.takeProfitRate)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {time(o.placedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {/* Open positions */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Open positions (demo)</h2>
            {data.openPositions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-amber-500/40 p-4 text-sm text-muted-foreground">
                No open demo positions.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-amber-500/40">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">TP</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.openPositions.map((p) => (
                      <TableRow key={p.positionId}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{p.symbol}</span>
                            {p.direction === "SHORT" && <Badge variant="destructive">SHORT</Badge>}
                            <StrategyTag strategy={p.strategy} />
                            {p.isBot && (
                              <Badge variant="outline" className="text-muted-foreground">
                                bot
                              </Badge>
                            )}
                          </div>
                          {p.name && (
                            <div className="max-w-[120px] truncate text-xs text-muted-foreground">
                              {p.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{usd(p.investedUsd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{rate(p.entryPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{rate(p.takeProfitRate)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${pnlClass(p.unrealizedPnl)}`}>
                          {p.unrealizedPnl == null ? "—" : usd(p.unrealizedPnl)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Closed positions */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Closed positions (bot)</h2>
            {data.closedPositions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-amber-500/40 p-4 text-sm text-muted-foreground">
                No closed bot positions yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-amber-500/40">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Close</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.closedPositions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-semibold">{p.symbol}</span>{" "}
                          {p.direction === "SHORT" && <Badge variant="destructive">SHORT</Badge>}{" "}
                          <StrategyTag strategy={p.strategy} />
                          <div className="text-xs text-muted-foreground">{time(p.closedAt)}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{rate(p.entryPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{rate(p.closeRate)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${pnlClass(p.realizedPnl)}`}>
                          {p.realizedPnl == null ? "—" : usd(p.realizedPnl)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={p.closeReason === "take-profit" ? "default" : "outline"}
                            className={p.closeReason === "take-profit" ? "" : "text-muted-foreground"}
                          >
                            {p.closeReason ?? "unknown"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Failed orders */}
          {data.failedOrders.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Failed orders</h2>
              <div className="space-y-1.5">
                {data.failedOrders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs"
                  >
                    <span className="font-semibold">{o.symbol}</span> {o.direction}{" "}
                    <StrategyTag strategy={o.strategy} /> · {time(o.placedAt)}
                    <div className="mt-0.5 break-words text-destructive">{o.error}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Signal & order log */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Bot log</h2>
            {data.events.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-amber-500/40 p-4 text-sm text-muted-foreground">
                No bot activity logged yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.events.map((e) => (
                  <details
                    key={e.id}
                    className="rounded-lg border border-border bg-card p-2.5 text-xs"
                  >
                    <summary className="cursor-pointer select-none">
                      <span className="font-mono text-muted-foreground">
                        {time(e.createdAt)}
                      </span>{" "}
                      <Badge
                        variant={
                          e.type.includes("REJECTED") || e.type === "ERROR" || e.type === "ORDER_BLOCKED"
                            ? "destructive"
                            : "outline"
                        }
                        className="mx-1 align-middle"
                      >
                        {e.type}
                      </Badge>
                      {e.symbol && <span className="font-semibold">{e.symbol} </span>}
                      {e.message}
                    </summary>
                    {e.payload != null && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-tight">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </details>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Auto-refreshes every {Math.round(refreshMs / 60000)} min. Reads eToro demo endpoints
            only — independent of the bot&apos;s global mode.
          </p>
        </>
      )}
    </div>
  );
}
