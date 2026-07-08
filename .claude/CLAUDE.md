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
- `GET /api/cron/signals` — 9:05 PM UTC weekdays (streak detection)
- `GET /api/cron/morning-brief` — 12:15 PM UTC weekdays (AI commentary)

To test manually, use the "Cron jobs" section in Settings → Run signals / Run morning brief

## Stack
- **Framework**: Next.js
- **Database**: Prisma + PostgreSQL
- **LLM**: Configurable (Claude, OpenAI, Gemini via kie.ai)
- **Market data**: Finnhub API
- **UI**: React + Tailwind + shadcn/ui
