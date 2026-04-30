# Dashki 🧭

Personal life dashboard 

## Stack

| Layer    | Tech                                          | Deploy     |
|----------|-----------------------------------------------|------------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, TypeScript | Vercel |
| Backend  | Express, sqlite3, Socket.io, TypeScript       | Railway    |
| Realtime | Socket.io                                     | (bundled)  |

## Modules

| Module          | Pages  | API Routes              | Status |
|-----------------|--------|-------------------------|--------|
| Dashboard       | `/`    | —                       | ✅ Full |
| Food Journal    | `/journal` | `/api/journal`      | ✅ Full |
| Food Database   | `/foods` | `/api/foods`          | ✅ Full |
| Saved Meals     | `/meals` | `/api/meals/saved`    | ✅ Full |
| Current Meal    | (shared) | `/api/meals/current` | ✅ Full |
| Calendar        | `/calendar` | `/api/auth`, `/api/calendar` | ✅ UI (Google sync TODO) |
| Weight Tracker  | `/weight` | `/api/weight`         | ✅ Full |
| Step Counter    | `/steps` | `/api/steps`           | ✅ Full |

## Getting Started

### Backend

```bash
cd server
cp .env.example .env   # edit as needed
npm install
npm run dev            # ts-node-dev hot reload
```

Runs on `http://localhost:4000`

### Frontend

```bash
cd web
npm install
npm run dev
```

Runs on `http://localhost:3000`

## Environment Variables

### `server/.env`

```
PORT=4000
DATABASE_PATH=./dashki.db
FRONTEND_ORIGIN=http://localhost:3000
OPENAI_API_KEY=          # optional — for voice parsing
```

### `web/.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Project Structure

```
Dashki/
  server/
    src/
      index.ts          Express entry — all routes + Socket.io
      db.ts             SQLite init + all table creation
      socket.ts         Socket.io singleton
      logger.ts         Safe logging with redaction
      routes/
        foods.ts
        meals.ts
        currentMeal.ts
        journal.ts
        steps.ts
        weight.ts
        calendar.ts
    package.json
    tsconfig.json
    .env.example
  web/
    src/
      app/
        layout.tsx      Root layout with animated glass background
        page.tsx        Dashboard home with live stats + quick actions
        foods/page.tsx  Full CRUD food database
        journal/page.tsx Food journal with daily nutrition tracker
        meals/page.tsx  Saved meal templates
        calendar/page.tsx Calendar view (Google sync planned)
        weight/page.tsx Weight log + line chart
        steps/page.tsx  Step counter + bar chart
      components/
        Sidebar.tsx     Desktop sidebar nav
        BottomNav.tsx   Mobile bottom nav
        ui/
          GlassCard.tsx
          GlassButton.tsx
          GlassInput.tsx
          GlassModal.tsx
          index.ts
      lib/
        api.ts          Typed API client
        types.ts        Shared TypeScript types
    tailwind.config.ts
    next.config.ts      (includes /api/* proxy rewrites)
    package.json
    tsconfig.json
  README.md
```

## API Reference

### Health
`GET /api/health` → `{ ok, uptime, timestamp, env }`

### Foods
- `GET /api/foods?search=` — list (with optional search)
- `GET /api/foods/:id`
- `POST /api/foods` — `{ name, baseAmount, baseUnit, calories, protein }`
- `PUT /api/foods/:id` — partial update
- `DELETE /api/foods/:id`

### Saved Meals
- `GET /api/meals/saved` — with items
- `POST /api/meals/saved`
- `DELETE /api/meals/saved/:id`

### Current Meal
- `GET /api/meals/current`
- `POST /api/meals/current` — `{ food_id, servings }`
- `PUT /api/meals/current/:id`
- `DELETE /api/meals/current/:id`
- `DELETE /api/meals/current` — clear all

### Journal
- `GET /api/journal?date=&startDate=&endDate=`
- `GET /api/journal/today-summary?date=`
- `POST /api/journal`
- `PUT /api/journal/:id`
- `DELETE /api/journal/:id`

### Steps
- `GET /api/steps?date=&startDate=&endDate=`
- `GET /api/steps/today`
- `POST /api/steps` — upsert `{ date, steps }`

### Weight
- `GET /api/weight?startDate=&endDate=&limit=`
- `GET /api/weight/latest`
- `POST /api/weight` — upsert `{ date, weight_kg }`
- `DELETE /api/weight/:id`

## Socket.io Events

Server emits to all clients on data changes:
- `food-created`, `food-updated`, `food-deleted`
- `journal-created`, `journal-deleted`
- `current-meal-updated`, `current-meal-cleared`
