# Catch the Drop

Personal trading signals app with backtesting, watchlist management, and AI-powered signal analysis.

## Deployment

This is a **Vercel project** (`catch-the-drop`).

### Current Setup
- Vercel project ID: `prj_awc5tRU9UjVslTF9QzCRkJWZXlcB`
- Org ID: `team_cScPeEquv0n28TvVpJ8AmYmU`
- Git remote: `origin` → https://github.com/andysamb4/catch-the-drop.git
- GitHub repo is connected to Vercel — pushing to `master` auto-deploys to production

### Deploy

**RULE: ALL changes ship via GitHub — commit and push to master. Never use
`vercel deploy --prod` (decided 2026-07-11).** CLI deploys push the working
directory as-is, so prod drifts from git and the next git-triggered build
silently rolls back whatever wasn't committed.

```bash
git push origin master
```

After pushing, confirm a new deployment actually appeared (Vercel dashboard,
or the Vercel MCP `list_deployments` tool) — on 2026-07-10 two pushes produced
no deployment. If a push doesn't trigger a build, fix the GitHub↔Vercel
connection or redeploy that commit from the dashboard — do NOT fall back to a
CLI deploy of the working tree. Note `vercel ls` may not list git-triggered
deploys under the CLI login and shows no timestamps; the dashboard is
authoritative.

The account is on the **Hobby plan**: crons are limited to once per day, and a
sub-daily schedule in `vercel.json` fails the entire deploy.

### Cron Jobs
Scheduled tasks are configured in `vercel.json`:
- `GET /api/cron/signals` — 9:05 PM UTC weekdays (streak detection + auto-trade order placement)
- `GET /api/cron/morning-brief` — 12:15 PM UTC weekdays (AI commentary)
- `GET /api/cron/trade-sync` — 8:45 PM UTC weekdays (fill/close reconciliation)

Because Hobby crons are once-daily, close detection polls via: trade-sync
(20:45), a reconcile at the start of the signals cron (21:05), and every
/sandbox page load/refresh.

To test manually, use the "Cron jobs" section in Settings → Run signals / Run morning brief / Run trade sync

## Auto-Trading (eToro)

All order traffic goes through `src/lib/etoro-execution.ts`; signal→order and
close-detection logic live in `src/lib/auto-trade.ts`. eToro closes positions
server-side via the native `takeProfitRate` attached to each order — the app
never runs a manual close loop, it only reconciles by polling.

Two eToro key pairs (keys are bound to ONE environment each, demo or real):
- `ETORO_API_KEY` — the short application key, shared by both pairs.
- `ETORO_USER_KEY` — Demo + Write private key (set 2026-07-10): auto-trading,
  sandbox, watchlists, candles. If real trading is ever enabled, this must be
  swapped for a Real + Write key.
- `ETORO_REAL_USER_KEY` — Real + Read private key, used ONLY by
  `getRealPortfolio()` for the Performance-page portfolio sync.

Env config (`src/lib/trading-config.ts`), all optional:
- `ETORO_MODE` — `demo` (default) or `real`. Only the exact string `real` selects live trading.
- `ETORO_ALLOW_REAL` — must ALSO be `true` for any real-money order; otherwise real-mode orders throw.
- `AUTO_TRADE` — set `false` to stop new orders (monitoring keeps running).
- `BOT_BANKROLL_USD` — default 5000. Bankroll sizing: each trade =
  (bankroll + realized bot P&L) / BOT_MAX_POSITIONS, so wins compound into
  larger trades and open positions lock their capital. Set 0 to revert to
  fixed TRADE_SIZE_USD sizing.
- `BOT_MAX_POSITIONS` — default 10 (concurrent bot position slots).
- `MIN_TRADE_USD` — default 50 (skip signals rather than place dust orders).
- `TRADE_SIZE_USD` — default 100; only used when `BOT_BANKROLL_USD=0`.
- `TAKE_PROFIT_PCT` — default 0.025 (2.5% favourable move, server-side TP).
- `STOP_LOSS_PCT` — unset = no stop-loss (disabled hook; set e.g. 0.05 to enable).
- `SANDBOX_REFRESH_MS` — default 7200000 (sandbox page auto-refresh, 2 h).

`/sandbox` page + `GET /api/sandbox` are hard-pinned to eToro's `/demo/`
endpoints regardless of `ETORO_MODE` — they can never touch real-money data.
Note: trading needs eToro keys with trade permission; the original keys were
read-only (see memory: etoro-api-integration).

## Strategies (champion vs challenger)

Every `WatchlistItem`, `Signal`, and `BotPosition` carries a `strategy` label
that flows watchlist → signal → position. Two strategies run in parallel on
demo, isolated for comparison (see `strategyConfig()` in `trading-config.ts`):

- **`core`** (champion, default) — the original single-stock streak bot. 90-day
  history, no trend filter, trades both directions. Every pre-existing row
  defaults to `core`; its behaviour is unchanged.
- **`etf-mr`** (challenger) — the same `detectStreakSignal` engine over a liquid
  ETF universe, gated by a long-SMA **trend filter** (BUY only when price is
  above its SMA, SHORT only below) and run **longs-only** by default on its own
  isolated compounding bankroll. Uses a 260-day history window so the SMA200 has
  real data. SHORT signals are still recorded but not traded while longs-only.

`strategy` is orthogonal to `mode` (demo/real) — never overload one for the
other. The `/sandbox` page shows a champion-vs-challenger scorecard (equity,
realized P&L, win rate, exposure per strategy).

Challenger env config (all optional, `trading-config.ts`):
- `ETF_MR_BANKROLL_USD` — default 5000; isolated pool, never draws from core's.
- `ETF_MR_MAX_POSITIONS` — default 10.
- `ETF_MR_LONGS_ONLY` — default `true`; set `false` to also trade SHORT.
- `ETF_MR_SMA_PERIOD` — default 200. `ETF_MR_MIN_TREND_BARS` — default 50 (below
  this, no signal rather than trade blind). `ETF_MR_HISTORY_WINDOW_DAYS` — 260.

Seeding the ETF universe (resolves eToro instrument IDs against the full
catalogue, drops unlisted symbols, never repurposes existing rows):
```bash
NODE_OPTIONS=--use-system-ca npx tsx prisma/seed-etf-mr.ts            # tier 1
NODE_OPTIONS=--use-system-ca npx tsx prisma/seed-etf-mr.ts --tiers=1,2
```
Tier 1 is live (33 ETFs; SPY/QQQ were reassigned from core, VYM/VLUE dropped as
unlisted). eToro's public API has no symbol→id lookup — `?symbols=` is ignored —
so resolution fetches the whole ~15.5k-instrument list via `getAllInstruments()`.

## Stack
- **Framework**: Next.js
- **Database**: Prisma + PostgreSQL
- **LLM**: Configurable (Claude, OpenAI, Gemini via kie.ai)
- **Market data**: Finnhub API
- **UI**: React + Tailwind + shadcn/ui
