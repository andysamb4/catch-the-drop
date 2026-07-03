# Watchlist Candidates — 3-Day Drop & Climb

Research notes for seeding the Phase 2 watchlist. Compiled **3 July 2026**; prices are approximate closes from that week and will drift — treat them as context, not live data. This is not financial advice.

## Why these and not others

The strategy buys after 3 consecutive down days and shorts after 3 consecutive up days. That's a **mean-reversion** bet, and it only pays on stocks that oscillate around a level rather than trend. The two failure modes to screen against:

- **BUY side — falling knives.** A stock in structural decline strings together 3-day drops all the way down. Three red days must usually be noise, not news.
- **SHORT side — runaway trends.** A stock in a strong uptrend prints 3 green days constantly; shorting each one is how the strategy bleeds out. This matters right now: tech rose ~80% in H1 2026 and chip names went vertical (Intel roughly tripled to ~$68), so most AI/semi names are currently poison for the short leg.

Good candidates are therefore: **liquid US large caps, in a multi-month sideways range, with enough daily movement (~1.5–3% average daily range) for the bounce to cover spread and overnight risk.** All names below are available on eToro.

## Tier 1 — Core range-bound candidates

| Ticker | Name | Sector | ~Price (Jul '26) | Why it fits |
|--------|------|--------|------------------|-------------|
| PFE | Pfizer | Healthcare | ~$24 | Textbook sideways: trading in a well-defined $23–29 band, close to range support. The ~7% dividend yield attracts buyers on every dip, which is exactly the mean-reversion pressure this strategy harvests. |
| PYPL | PayPal | Fintech | ~$44 | Years of post-2021 chop in the $40s–$60s with no sustained trend either way. Very liquid, moves 2%+ on plenty of days, and analyst targets ($42–$51) bracket the current price — the market itself is range-bound on it. |
| NKE | Nike | Consumer | ~$41 | Analysts explicitly describe it as range-bound while the turnaround plays out; July forecasts span roughly $37–49. Just popped 5% on earnings, showing it snaps back hard. Caution: pause signals in the week around quarterly earnings — the gaps are large. |
| VZ | Verizon | Telecom | ~$40 | The low-volatility ballast of the list. High-yield, low-valuation, drifts in a narrow band. Signals will be less frequent and smaller, but the BUY side is about as safe as single-stock dip-buying gets. |
| DIS | Disney | Media | ~$100s | Multi-year oscillator between roughly $85 and $120 — repeated failed breakouts in both directions. *Price/range not re-verified this week; check the chart before adding.* |
| F | Ford | Auto | ~$10–14 | Has yo-yoed in a single-digit-to-low-teens band for years with a fat dividend anchoring the bottom of the range. *Not re-verified this week; confirm no tariff/EV headline has broken the range.* |
| SBUX | Starbucks | Consumer | ~$80–100 | Turnaround chop under the new CEO — big swings on comps data, no durable trend yet. *Not re-verified this week.* |

## Tier 2 — High-beta oscillators (bigger wins, bigger losses)

| Ticker | Name | ~Price (Jul '26) | Why it fits — and the catch |
|--------|------|------------------|------------------------------|
| COIN | Coinbase | ~$163 | Verified two-sided action right now: swung from ~$163 down to ~$139 and back to the mid-$160s inside two weeks (late June 2026). Beta ~3.3. The 3-day signals will fire often and the moves are big — but a crypto regime change turns it into a trender overnight. Size small. |
| AMD | AMD | — | Extremely liquid semi proxy. Only interesting *because* chips are pulling back after the H1 melt-up and may now chop sideways. Do **not** take SHORT signals here until the AI uptrend is clearly dead; consider it BUY-side only. |

## Consider instead of / alongside single stocks: index ETFs

The academic and backtest literature consistently finds short-term mean reversion is **more reliable on indices than single stocks** — a 3-day drop in SPY or QQQ has historically been one of the better-documented dip-buy setups, because index drops are rarely driven by one company's fundamentals deteriorating. eToro carries both. A pragmatic watchlist split: SPY/QQQ as the high-win-rate core, single stocks above for larger per-trade moves.

## Avoid for this strategy (right now)

- **NVDA, INTC, PLTR, TSLA and other momentum leaders** — Intel at ~$68 after tripling is the poster child: every 3-up-day SHORT signal this year would have been steamrolled. Revisit only if they establish a range.
- **MRNA and other structural decliners** — 3-down-day BUY signals are knife-catching when the downtrend is fundamental.
- **Anything with a pending buyout or takeover chatter** — price pins to the deal price and stops oscillating.
- **Small caps / low float** — spreads and slippage on eToro eat the edge.

## Screening criteria for the Yo-Yo Score (Phase 2/5 input)

When the watchlist and Yo-Yo Hunter get built, these are the measurable proxies for everything above:

1. **Range position** — price within ±1.5σ of its 100-day mean (not trending).
2. **ADX < 25** on the daily — confirms absence of trend.
3. **Average daily range 1.5–3%** — enough movement to profit, not so much that stops blow out.
4. **Dollar volume > $100M/day** — liquidity floor.
5. **Reversal rate** — historical % of 3-day drops followed by a green day within 2 sessions; this is the single most direct backtest of the strategy per ticker.
6. **No earnings inside the signal window** — suppress or flag signals within ~5 trading days of a report.

## Sources

- [Fidelity — Stock market outlook midyear 2026](https://www.fidelity.com/learning-center/trading-investing/stock-market-outlook)
- [TheStreet — Stock Market Today, July 2 2026 (Dow all-time high, tech volatility)](https://www.thestreet.com/stock-market-today/stock-market-today-dow-jones-sp-500-nasdaq-updates-july-2-2026)
- [Motley Fool — Pfizer vs Verizon: high-yield comparison (July 2026)](https://www.fool.com/investing/2026/07/01/pfizer-vs-verizon-communications-which-high-yieldi/)
- [TIKR — Pfizer dividend yield at 7% heading into H2 2026](https://www.tikr.com/blog/pfizer-stocks-dividend-yield-sits-at-7-heading-into-the-back-half-of-2026)
- [LiteFinance — Pfizer 2026 technical forecast (sideways base case)](https://www.litefinance.org/blog/analysts-opinions/pfizer-stock-forecast-and-price-prediction/)
- [24/7 Wall St — Nike rebound prediction, July 2026 prices](https://247wallst.com/investing/2026/07/03/prediction-nike-stock-set-for-25-rebound-after-brutal-year/)
- [TIKR — Nike restructuring and range-bound outlook](https://www.tikr.com/blog/nike-stock-is-down-50-from-its-2021-high-heres-what-the-restructuring-means-for-the-recovery)
- [StocksToTrade — Coinbase June/July 2026 swing action](https://stockstotrade.com/news/coinbase-global-inc-coin-news-2026_07_01/)
- [StockAnalysis — Intel (INTC) price overview](https://stockanalysis.com/stocks/intc/)
- [QuantifiedStrategies — Backtested mean reversion strategies (indices vs single stocks)](https://www.quantifiedstrategies.com/mean-reversion-strategies/)
- [Quantum Algo — Mean reversion trading 2026 guide (what to avoid)](https://www.quantum-algo.com/blog/guides/mean-reversion-trading-complete-guide/)
