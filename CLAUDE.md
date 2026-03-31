# Dashki — Claude Code Guide

## Project Overview

Dashki is a personal health & productivity dashboard. It tracks food/nutrition (journal), weight, steps, workouts, todos, meals, and a calendar. The app runs as a Next.js frontend talking to an Express/SQLite backend.

---

## Architecture

```
dashki/
├── web/        # Next.js 14 frontend (React 18, Tailwind CSS)
└── server/     # Express backend (TypeScript, SQLite)
```

---

## Dev Commands

### Frontend (`web/`)
```bash
cd web
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
```

### Backend (`server/`)
```bash
cd server
npm run dev      # Start with ts-node-dev (hot reload)
npm run build    # Compile TypeScript → dist/
npm start        # Run compiled dist/index.js
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | Next.js 14 (App Router) |
| UI | React 18 + Tailwind CSS 3 |
| Icons | Lucide React |
| Charts | Recharts |
| Styling system | Custom "Glass" design system (`src/components/ui/`) |
| Real-time | Socket.io-client / socket.io |
| Backend | Express 4 + TypeScript |
| Database | SQLite (via sqlite3) |
| AI integration | OpenAI SDK |

---

## Key File Locations

### Frontend (`web/src/`)
- `app/journal/page.tsx` — Food/nutrition journal page (largest page, ~1000 lines)
- `app/layout.tsx` — Root layout, sidebar/theme persistence
- `app/globals.css` — CSS custom properties (theme vars, animations, scrollbar)
- `components/ui/GlassModal.tsx` — Reusable modal component
- `components/ui/GlassCard.tsx` — Reusable card component
- `components/ui/GlassButton.tsx` — Reusable button component
- `components/ui/GlassInput.tsx` — Reusable input component
- `components/ui/index.ts` — UI component barrel export
- `lib/api.ts` — API client functions (all fetch calls to backend)
- `lib/types.ts` — Shared TypeScript types

### Backend (`server/src/`)
- `src/index.ts` — Entry point, Express app setup
- `src/seed-foods.json` — Initial food database seed data

---

## Coding Conventions

### General
- All frontend components use `'use client'` directive where needed (Next.js App Router)
- TypeScript strict mode — always type props interfaces explicitly
- No default exports except for page components and UI components; use named exports for utilities

### Styling
- Use Tailwind utility classes exclusively — no inline styles except for dynamic values
- Follow the existing "Glass" design language: `bg-white/5`, `border-white/10`, `rounded-2xl`, `backdrop-blur`
- Dark mode is the default theme; light mode overrides use `html:not(.dark)` in globals.css
- Glass morphism color tokens are defined as CSS custom properties in `globals.css`
- Avoid hardcoded color values; use the existing glass/primary/accent palette

### Components
- Reuse `GlassModal`, `GlassCard`, `GlassButton`, `GlassInput` from `components/ui/` for all UI elements
- Modal sizing: use the `size` prop (`sm | md | lg | xl`) and `minHeight` for fixed-height modals
- Page components live in `app/<page>/page.tsx` and are the only files that fetch data directly

### State & Data
- Local state with `useState`/`useEffect` — no global state library
- API calls go through `lib/api.ts` functions, not raw `fetch` in components (except `FoodPicker` which queries directly)
- Dates: always use local time, not UTC — use `toISODate(new Date())` pattern (see journal page)
- User preferences (goals, theme) are stored in `localStorage`

### Naming
- React components: `PascalCase`
- Functions and variables: `camelCase`
- API route handlers: REST conventions (`GET /api/foods`, `POST /api/journal`, etc.)
- TypeScript interfaces: `PascalCase` with descriptive names (e.g., `JournalEntry`, `Food`, `MealType`)
