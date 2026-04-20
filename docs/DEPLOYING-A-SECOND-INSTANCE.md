# Deploying a second Dashki instance (e.g. for a family member)

This doc explains how to spin up a **completely independent copy** of Dashki
for someone else — they get their own data, their own URL, and their actions
have no effect on your deployment. Both deployments share the same source
code (so feature updates flow to both via git), but **never** share data.

No login, no multi-tenancy, no code changes. Two parallel deployments off
the same repo.

## Architecture

```
        YOURS                              SECOND USER (e.g. Teela)
   ─────────────────────────              ─────────────────────────
   dashki-yours.vercel.app                teela-dashki.vercel.app
            ↓                                       ↓
       Railway service                          Railway service
       + own SQLite volume                      + own SQLite volume
       dashki-production.up.railway.app         dashki-teela.up.railway.app

                   \                           /
                    └── github.com/<repo> ────┘
                            (master)
```

Each Railway service gets its own persistent volume → its own `dashki.db`
SQLite file → completely isolated data. The frontend reads which backend
to talk to from `NEXT_PUBLIC_API_URL` set per-Vercel-project. No backend
code knows or cares about who's calling it.

## What you need before starting

The second user needs their own:
- GitHub account (free) — to access the repo (you can either invite them as
  a collaborator on your private repo, OR they fork it publicly)
- Railway account (free tier works; ~$5/mo if you exceed free hours)
- Vercel account (free Hobby tier is fine)

You don't need to do anything on your existing setup — leave it untouched.

## Step 1 — Backend on Railway

1. The second user signs in to [railway.app](https://railway.app).
2. **New Project** → **Deploy from GitHub Repo** → pick the Dashki repo.
3. When Railway asks which service to deploy, point it at the **`server/`**
   folder (root directory = `server`).
4. Railway will detect Node.js, install dependencies (`npm install`), and
   run the build. Default start command (`npm start`) is correct.
5. **Add a persistent volume** (Railway → Service → Settings → Volumes →
   New Volume). Mount path: `/app/data` (or wherever the server expects
   the DB — check `server/src/db.ts`). Size: 1 GB is fine.
6. **Add environment variables** (Railway → Variables):
   - `PORT=8080` (or whatever Railway suggests)
   - `FRONTEND_ORIGIN=https://<their-frontend>.vercel.app` (you'll fill this
     in after Step 2 — for now, leave blank or set to a placeholder; you can
     update it after the frontend is deployed.)
7. **Generate a public domain** (Railway → Service → Settings → Networking →
   Generate Domain). Note the URL — e.g. `dashki-teela-production.up.railway.app`.
8. Wait for the first deploy to finish. Verify it's alive by visiting
   `https://<their-railway-url>/api/foods` in a browser — should return
   `[]` (empty array, since the DB is fresh).

## Step 2 — Frontend on Vercel

1. The second user signs in to [vercel.com](https://vercel.com).
2. **Add New** → **Project** → **Import Git Repository** → pick the same
   Dashki repo.
3. **Root Directory:** set to `web` (the Vercel UI lets you pick).
4. Framework preset: Next.js (auto-detected).
5. **Environment Variables** (this is the critical one):
   - Name: `NEXT_PUBLIC_API_URL`
   - Value: `https://<their-railway-url>` (the one from Step 1.7)
   - Apply to: Production, Preview, Development
6. **Deploy**. Wait ~2 minutes for the first build.
7. Vercel gives the project a URL like `teela-dashki.vercel.app`. Note it.
8. Go back to Railway → backend service → Variables → set
   `FRONTEND_ORIGIN=https://teela-dashki.vercel.app`. Redeploy the
   backend (Railway does this automatically on env-var change).

## Step 3 — Verify

Open the Vercel URL in a browser. The dashboard should load showing all
zeros (fresh DB). Add a journal entry — confirm the page reloads with the
new entry. Check that:

- Your existing site still shows your data, unchanged.
- The second user's site shows only theirs.
- Visiting either site's `/api/foods` endpoint hits the corresponding
  Railway backend (open the Network tab in DevTools to confirm).

That's it. Two completely independent apps, one codebase.

## Step 4 (optional) — Desktop app for the second user

If they also want the Windows desktop app, the API URL is currently
hardcoded at build time in `desktop/vite.config.ts`:

```ts
const PROD_API_URL = "https://dashki-production.up.railway.app";
```

To build a desktop installer pointed at their backend instead:

1. Clone the repo locally.
2. Edit `desktop/vite.config.ts` and change `PROD_API_URL` to their
   Railway URL.
3. `cd desktop && npm install && npm run build`
4. The installer lands at `desktop/release/Dashki Desktop Setup 1.0.0.exe`.
   Hand it to them. Don't commit the change.

Or, cleaner long-term, expose the API URL as an environment variable that
`vite.config.ts` reads from `process.env`. That way each user can build
their own installer with `DASHKI_API_URL=... npm run build`. Out of scope
for the initial setup but a worthwhile future tweak.

## Step 5 (optional) — iOS Scriptable widget for the second user

The Scriptable widget (`tools/scriptable/dashki-widget.js`) has the API
URL at the top:

```js
const API_BASE = "https://dashki-production.up.railway.app";
```

The second user just changes that one line to their Railway URL and pastes
into Scriptable. No rebuild needed.

## How updates flow after setup

When you push code to `master`:

- **Vercel** auto-deploys both frontends (yours and theirs) on next push.
  Both pick up the new code; data is unaffected.
- **Railway** auto-deploys both backends on next push. SQLite schema stays
  intact between deploys (the persistent volume survives redeploys).
- **Scriptable widget** does NOT auto-update — each user needs to re-paste
  the script.
- **Desktop app** does NOT auto-update — to ship a new build, you re-build
  the installer and re-distribute.

If the second user wants to **lag behind your changes** (e.g. they want a
stable version while you experiment), have them:
- Vercel → Settings → Git → set Production Branch to a specific branch
  (e.g. `teela-stable`) instead of `master`. Then they choose when to
  fast-forward that branch.
- Same on Railway → Settings → Service → Branch.

## Costs

- **Railway** — first 500 hours/month + 1GB outbound free; Hobby plan is
  $5/mo if exceeded. Two backends = two services = ~2× usage.
- **Vercel** — Hobby tier covers personal/non-commercial use for free up
  to 100GB bandwidth/month. Two frontends usually still fit.
- **GitHub** — free. Private repo collaborators are free under the Pro
  plan or via the user being added to your account's repo.

## What this does NOT do

- **No login.** Anyone with the URL can use either site. If you want
  basic protection, add an env var with a shared secret and check it in
  middleware — but that's an explicit code change, not part of this setup.
- **No data migration between accounts.** Each SQLite file is independent.
  If the second user wants a starter dataset, copy your seed JSON over
  manually before they start logging.
- **No real-time sync between accounts.** Each backend has its own
  Socket.io instance scoped to its own data.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel build fails | Wrong Root Directory | Set Root Directory to `web` |
| Frontend loads but no data | `NEXT_PUBLIC_API_URL` wrong or missing | Vercel → Settings → Env Vars; redeploy |
| CORS error in console | `FRONTEND_ORIGIN` env var on Railway not set or stale | Set it to the Vercel URL exactly, no trailing slash; redeploy |
| Data resets between deploys | No persistent volume mounted on Railway | Add a volume in Step 1.5 |
| Both sites showing same data | Both pointing at the same Railway backend | Check `NEXT_PUBLIC_API_URL` on each Vercel project — they must differ |
