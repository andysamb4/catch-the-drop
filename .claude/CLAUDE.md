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

**Preferred: commit and push to master**
```bash
git push origin master
```
Commit all working-tree changes before pushing — a git-triggered build deploys only
what's committed, so uncommitted features that reached prod via CLI deploys would
otherwise be rolled back.

**Fallback: Vercel CLI** (deploys the working directory as-is, even uncommitted)
```bash
vercel deploy --prod
```

### Cron Jobs
Scheduled tasks are configured in `vercel.json`:
- `GET /api/cron/signals` — 9:05 PM UTC weekdays (streak detection + auto-trade order placement)
- `GET /api/cron/morning-brief` — 12:15 PM UTC weekdays (AI commentary)
- `GET /api/cron/trade-sync` — every 30 min, 13:00–21:30 UTC weekdays (fill/close reconciliation)

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
- `TRADE_SIZE_USD` — default 100 ($ per trade, leverage 1).
- `TAKE_PROFIT_PCT` — default 0.025 (2.5% favourable move, server-side TP).
- `STOP_LOSS_PCT` — unset = no stop-loss (disabled hook; set e.g. 0.05 to enable).
- `SANDBOX_REFRESH_MS` — default 7200000 (sandbox page auto-refresh, 2 h).

`/sandbox` page + `GET /api/sandbox` are hard-pinned to eToro's `/demo/`
endpoints regardless of `ETORO_MODE` — they can never touch real-money data.
Note: trading needs eToro keys with trade permission; the original keys were
read-only (see memory: etoro-api-integration).

## Stack
- **Framework**: Next.js
- **Database**: Prisma + PostgreSQL
- **LLM**: Configurable (Claude, OpenAI, Gemini via kie.ai)
- **Market data**: Finnhub API
- **UI**: React + Tailwind + shadcn/ui
