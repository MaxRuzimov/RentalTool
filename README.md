# RentalTool

P2P tool/equipment rental marketplace, launching in the Greater Toronto Area (Canada). See [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) for the business context and [MILESTONES.md](./MILESTONES.md) for delivery status.

## Stack

- **Web**: [apps/web](./apps/web) — Next.js, deployed to Vercel
- **Backend/DB/Auth**: [Supabase](./supabase) — Postgres, auth, storage
- **Mobile**: React Native (Expo) — added in M8

## Getting started

```bash
npm install
cp .env.example .env.local   # apps/web reads this — fill in Supabase project values
npm run dev                  # starts apps/web on http://localhost:3000
```

### Supabase (local)

Requires [Docker](https://www.docker.com/) and the Supabase CLI (`brew install supabase/tap/supabase`).

```bash
supabase start                # spins up local Postgres/Auth/Storage
supabase db reset             # applies supabase/migrations/*.sql
```

Schema changes go in `supabase/migrations/` as new timestamped SQL files — do not edit past migrations.

## Monorepo layout

```
apps/
  web/          Next.js app
supabase/
  migrations/   SQL schema history
.github/
  workflows/    CI
```
