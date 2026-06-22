# Ranking Pro — Magic Tiles 3 Live Leaderboard

Live dashboard for MT3 Season rankings. Features: top-100 leaderboard with rank-change arrows, win streaks, Hall of Fame, player search, season prize breakdown, season countdown, and global chat.

## Stack

| Piece | Tool | Why |
|---|---|---|
| Frontend + API | Next.js on **Vercel** (Hobby/free) | Auto-deploys from GitHub, free SSL |
| Database | **Supabase** (free tier) | Real Postgres |
| Data ingestion | **GitHub Actions** (free, cron) | Runs every 10 min |

---

## Setup (~15 minutes)

### 1. Supabase

1. [supabase.com](https://supabase.com) → New project (free tier).
2. **SQL Editor → New query**, paste `supabase/schema.sql`, run it.
3. Copy from **Project Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ranking-pro.git
git push -u origin main
```

### 3. Deploy to Vercel

1. [vercel.com](https://vercel.com) → Add New Project → import the repo.
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INGEST_SECRET` — generate with `openssl rand -hex 32`
3. Deploy.

### 4. GitHub Actions secrets

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
|--------|-------|
| `GAME_API_ACCESS_KEY` | `Mn1iiAAAAB1UI-aNNnM-7833` |
| `GAME_API_VERSION` | `13.063.007` |
| `SITE_URL` | Your Vercel URL, e.g. `https://ranking-pro.vercel.app` |
| `INGEST_SECRET` | Same value as on Vercel |

Test immediately: **Actions → Sync MT3 ranking data → Run workflow**.

---

## What each sync does

Every 10 minutes the GitHub Action:

1. `POST /api/fetchSeason` → gets season number + prize data, auto-rolls over to new season if it changed
2. `POST /api/top` → pulls the full top-100 leaderboard
3. POSTs to `/api/ingest` → upserts players + stats, recomputes ranks, snapshots rank history for ↑↓ arrows

---

## Features

| Tab | What it shows |
|-----|--------------|
| **Rankings** | Top-100 with podium, win rate, active streaks, ↑↓ rank-change arrows since last sync |
| **Streaks** | Players with the longest current win streak |
| **Hall of Fame** | Season winners from past seasons (fills in when a season closes) |
| **Find Player** | Search by name → rank, win rate, battles, best streak, country flag, achievement badge, **points trend sparkline, percentile, points behind #1, and name history** |
| **Prizes** | This season's reward breakdown by rank (avatar, diamonds, VIP days, rank frame) |
| **Countries** | Aggregated leaderboard by country — total points, player count, top player per country |
| **Chat** | Global chat, no login required |

A palette icon in the header swaps the accent theme between gold and violet (saved in the browser, no login needed).

Achievement badges (Hot Streak / On Fire / Unstoppable / Legendary Run) are computed automatically from each player's `best_streak`, using the thresholds already defined in the `achievements` table in `supabase/schema.sql`. Name changes are now detected automatically during sync and logged to `name_history`.

Season countdown timer shows in the header once `fetchSeason` has run.

---

## Starting a new season manually

The sync job handles this automatically when MT3 rolls to a new season. If you need to do it manually:

```sql
-- In Supabase SQL Editor
update seasons set is_current = false;
insert into seasons (number, label, is_current, duration_days)
values (206, 'Season 206', true, 14);
```

---

## Local development

```bash
cp .env.example .env.local   # fill in your real values
npm install
npm run dev
```

Manual sync test:
```bash
GAME_API_ACCESS_KEY=Mn1iiAAAAB1UI-aNNnM-7833 \
GAME_API_VERSION=13.063.007 \
SITE_URL=http://localhost:3000 \
INGEST_SECRET=any-local-secret \
node scripts/fetch-and-sync.js
```
