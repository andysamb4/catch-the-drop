# Catch the Drop

Personal trading signals app with backtesting, watchlist management, and AI-powered signal analysis.

## Deployment

This is a **Vercel project** (`catch-the-drop`).

### Current Setup
- Vercel project ID: `prj_awc5tRU9UjVslTF9QzCRkJWZXlcB`
- Org ID: `team_cScPeEquv0n28TvVpJ8AmYmU`
- No git remote configured (local repo only)
- No GitHub Actions workflow

### Deploy Options

**Option 1: Use Vercel CLI (recommended)**
```bash
vercel deploy --prod
```

**Option 2: Push to GitHub + auto-deploy**
1. Create a repo on GitHub
2. Add remote: `git remote add origin <github-url>`
3. Connect GitHub repo to Vercel in dashboard (Settings → Git Integration)
4. Push to main branch — auto-deploys to production

**Option 3: Use Vercel Dashboard**
- Open https://vercel.com/dashboard
- Find `catch-the-drop` project
- Trigger deployment manually

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
