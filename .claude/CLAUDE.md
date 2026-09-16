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
- `GET /api/cron/morning-brief` — 12:15 PM UTC weekdays (per-signal AI
  commentary, the major-events-only MarketAlert, and the everyday DailyBrief —
  a pre-US-open digest of futures/oil/VIX tape (Yahoo), overnight headlines
  with summaries (Finnhub), the week's earnings hitting watched/held names
  (Finnhub `/calendar/earnings`, free tier), and open bot positions; rendered
  as the home-page "Morning brief" card, `src/lib/daily-brief.ts`)
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
- `STOP_LOSS_PCT` — unset = no stop-loss on LONGS (set e.g. 0.05 to enable both ways).
- `SHORT_STOP_LOSS_PCT` — default 0.10. Legacy since the long-only switch: no new
  shorts are placed, but eToro REQUIRES a stopLossRate on every short
  (`sellShort`) order, so the shorts still open from before carry a stop —
  `STOP_LOSS_PCT` if set, else this wide emergency stop. Discovered 2026-07-13:
  shorts had silently failed since launch (`transaction: "sell"` is unsupported
  by the API; shorts open as `sellShort`).
- `SANDBOX_REFRESH_MS` — default 7200000 (sandbox page auto-refresh, 2 h).

`/sandbox` page + `GET /api/sandbox` are hard-pinned to eToro's `/demo/`
endpoints regardless of `ETORO_MODE` — they can never touch real-money data.
Note: trading needs eToro keys with trade permission; the original keys were
read-only (see memory: etoro-api-integration).

## Long-only (since 2026-08-04)

**The strategy takes the long side only.** `LONG_ONLY` in `trading-config.ts` is
the switch — deliberately a code constant, not an env var. Evidence: longs hit
the server-side take-profit reliably, while the two manually-closed shorts were
the worst trades on record (-$54 each, PLTR and MSFT).

What it means, end to end:
- The nightly scan still *detects* up-streaks (`detectStreakSignal` is shared
  with the backtest) but drops them before any write — **no new SHORT `Signal`
  row is ever created**, and the run reports `SHORT streak ignored (long-only)`.
- `SignalOrderInput.type` is `"BUY"` — a short order is not expressible;
  `executeSignalOrder` also refuses one at runtime.
- The SHORT arms of `takeProfitRateFor` / `stopLossRateFor` / `inferCloseReason`
  and `placeMarketOrder`'s `sellShort` path stay: **legacy open shorts still
  reconcile** and still get their TP re-anchored. The bot never closes them.
- Nothing is deleted. Historical SHORT signals, trades and bot positions stay in
  the DB (`SignalType.SHORT` and `TradeDirection.SHORT` remain in the schema) and
  stay browsable: /signals defaults to BUY with archived shorts one filter away,
  Performance defaults to long-only with a Long+short / Short-only filter, and
  the Backtest tab has an "Include SHORT trades" checkbox for A/B comparison.
- AI prompts (`ai/prompts.ts`) are long-only: "Why this fired" takes no direction
  and must never suggest fading/shorting.

To reverse: flip `LONG_ONLY` to `false`, then follow the type errors — they land
exactly on the sites that must widen back to `"BUY" | "SHORT"`.

## Price history & data gaps (since 2026-08-06)

Two sources fill `PriceBar`, chosen per ticker by `etoroInstrumentId`:

- **Mapped tickers** → eToro daily candles: the whole window every run, so gaps
  self-heal by construction.
- **Unmapped tickers** (22 of ~127, e.g. NVDA, AMD, PFE) → **Yahoo's keyless
  chart API for the window** (`getDailyBars`, `price-history.ts`) plus Finnhub
  `/quote` for today. Finnhub's free tier has no historical candles, so before
  this the history was built one quote a day and never repaired.

That one-quote-a-day design was the bug behind the home-page gap spam: on
2026-08-04 the Finnhub leg failed for all 22 at once (eToro tickers were fine),
and since a hole permanently blocked detection those tickers were silently muted
from then on. The holes were real, the fix is to fill them.

Three rules now keep the series honest:
- **Backfill first, every run** — insert-only (`skipDuplicates`), so today's bar
  stays the live quote's.
- **No bars on non-trading days.** A manual weekend run used to store Friday's
  close under Saturday's date; that flat bar breaks any streak spanning it.
  Detection also filters existing ones out (they're left in the DB, not deleted).
- **A gap degrades, it never mutes.** Unfillable holes fall back to
  `barsAfterLastGap` — the closes after the last hole are genuinely consecutive —
  and only skip when fewer than 4 bars remain. A missing day the upstream series
  doesn't have either isn't reported (the instrument didn't trade; `market-calendar`
  models NYSE only).

Gap notices auto-clear (`resolvePriceGaps`) once a symbol's history is whole, and
render as a collapsed footnote at the **bottom** of the home and signals pages —
a data-quality caveat under the numbers, not a red banner above them.

Manual repair after an outage:
```bash
NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env scripts/backfill-price-bars.ts --dry-run
NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env scripts/backfill-price-bars.ts
```

## Strategies (champion vs challenger)

Every `WatchlistItem`, `Signal`, and `BotPosition` carries a `strategy` label
that flows watchlist → signal → position. Two strategies run in parallel on
demo, isolated for comparison (see `strategyConfig()` in `trading-config.ts`):

- **`core`** (champion, default) — the original single-stock streak bot. 90-day
  history, no trend filter. Every pre-existing row defaults to `core`.
- **`etf-mr`** (challenger) — the same `detectStreakSignal` engine over a liquid
  ETF universe, gated by a long-SMA **trend filter** (BUY only when price is
  above its SMA) on its own isolated compounding bankroll. Uses a 260-day history
  window so the SMA200 has real data.

Both are long-only (see above); direction is no longer a per-strategy setting.

`strategy` is orthogonal to `mode` (demo/real) — never overload one for the
other. The `/sandbox` page shows a champion-vs-challenger scorecard (equity,
realized P&L, win rate, exposure per strategy).

Challenger env config (all optional, `trading-config.ts`):
- `ETF_MR_BANKROLL_USD` — default 5000; isolated pool, never draws from core's.
- `ETF_MR_MAX_POSITIONS` — default 10.
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

## AI models & the vendor fallback (since 2026-09-15)

Every LLM call goes through `src/lib/ai/client.ts`, which walks `MODEL_CHAIN` in order:

```ts
const MODEL_CHAIN = ["gpt-5-2", "gemini-3.1-pro"];  // lead first
```

Like `LONG_ONLY`, this is **deliberately a code constant, not an env var** — the order is
an evidence-driven decision and belongs in the git history, not in a Vercel setting that
can't be read back (`vercel env pull` returns empty strings). `KIE_MODEL_CHAIN`
(comma-separated) overrides the whole list for an experiment. `KIE_MODEL` and
`KIE_FALLBACK_MODEL` are **no longer read** — any copy still sitting in Vercel does
nothing and can be deleted.

Why a chain: kie.ai's Gemini upstream intermittently answers with an account-level
"Prohibited Use Policy" refusal — **HTTP 200, normal completion shape, the refusal sitting
in the content where the answer should be**. On 2026-09-15 that text rendered verbatim on
the home page's morning-brief card. The client now treats a refusal (or an empty answer)
as `AIBlockedError` and moves to the next model, which is always a *different vendor* — a
refusal is a property of that vendor's policy layer, so retrying the same one is futile.
Every model failing throws one `AIError` naming each with its reason, which is what lands
in the cron's status line.

Why GPT leads (switched 2026-09-16): Gemini is the side that got blocked, and on a
head-to-head of the same real daily-brief prompt GPT 5.2 caught a scheduled catalyst
(Fed commentary) that Gemini dropped.

This covers every caller at once: daily brief, market alert, per-signal commentary,
yo-yo hunter, and the chat agent loop (safe to replay — all AI tools are reads). The
daily brief's template fallback (`buildFallbackDailyBrief`) is now genuine last resort.

kie.ai model notes:
- The catalogue is `GET https://api.kie.ai/api/v1/models` (~206 models; the LLMs are the
  `"taskType": ["Chat"]` ones). Listing it is the only way to know what exists.
- Not every listed Chat model is enabled on this key — `gpt-5-5`, `gpt-5-6-*` and
  `gpt-6-astra` all answer `{"code":422,"msg":"The model is not supported"}` (an **HTTP
  200** with the error in the body). `gpt-5-2` works; it's ~$0.44/M in, $3.50/M out,
  within pennies of the Gemini default.
- Wire formats: Claude models → `/claude/v1/messages`; everything else →
  `/{model}/v1/chat/completions` with the model in the *path*, not the body.

To change the lead or add a third model, edit `MODEL_CHAIN` and push — no dashboard step.

## Stack
- **Framework**: Next.js
- **Database**: Prisma + PostgreSQL
- **LLM**: Configurable (Claude, OpenAI, Gemini via kie.ai)
- **Market data**: Finnhub API
- **UI**: React + Tailwind + shadcn/ui
