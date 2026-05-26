# Dashki Mobile

Native iOS + Android app for Dashki, built with Vite + React + Capacitor.

## Architecture

Sibling of `../web/` (Next.js) and `../server/` (Express) in the same git repo.
All three share one origin. The mobile app talks to the same Express backend
the web app talks to (Railway in production).

```
dashki/
├── web/        ← Next.js, deploys to Vercel
├── mobile/     ← this app, deploys to App Store + Play Store
└── server/     ← Express, deploys to Railway
```

See `DSHKI-45` (epic) for the full mobile v1 plan.

## Development

```bash
npm install
npm run dev
```

Opens at <http://localhost:5173>. Vite hosts on `0.0.0.0` so a phone on the
same WiFi can hit `http://<your-LAN-IP>:5173` for in-browser testing before
the native shell is set up.

## Build

```bash
npm run build       # tsc --noEmit + vite build
npm run typecheck   # TS only, no bundle
```

Output goes to `dist/`. Once Capacitor lands (DSHKI-47), `npx cap sync` will
copy `dist/` into the native iOS and Android shells.

## Design tokens

`src/index.css` is a copy of `../web/src/app/globals.css` — same Notion-inspired
warm-neutral palette and Glass language as web. Two deliberate drifts:

1. **No `.sidebar-offset` rule** — mobile uses bottom tabs, not a left sidebar.
2. **`viewport-fit=cover` and `apple-mobile-web-app-*` meta tags** in `index.html`
   so the WebView respects iOS safe areas once Capacitor is wired in.

When `globals.css` is updated on web, port the changes here in the same commit
(or document why the divergence is intentional).

## Path aliases

`@/*` → `./src/*`, matching web's convention.

## Status

**Phase 0 — scaffolding only.** No routes, no API client, no native shell yet.
That's DSHKI-47 (Capacitor) + DSHKI-48 (Hello Dashki screen) + DSHKI-49 (API wiring).
