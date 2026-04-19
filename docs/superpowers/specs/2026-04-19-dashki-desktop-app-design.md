# Dashki Desktop App — Design

**Date:** 2026-04-19
**Status:** Approved (ready for implementation plan)

## Goal

A Windows desktop application that exposes only the **Food Journal** and **Foods database** pages from the Dashki web app. The app auto-starts on Windows boot, lives in the system tray, and looks visually identical to the corresponding pages in the existing web app.

## Non-Goals

- No support for any Dashki page other than Journal and Foods (no Calendar, Steps, Weight, Gym, Meals, Todos, Dashboard).
- No macOS or Linux build in v1.
- No auto-update mechanism in v1 (re-run the installer to upgrade).
- No bundled backend; the app talks to the live production API only.
- No authentication layer (the production API is currently public).

## Hard Constraints

### Isolation guarantee
The desktop project **MUST NOT modify any file inside `web/` or `server/`**. The desktop project is purely additive.

If during implementation a journal/foods page component appears to need a behavioral tweak to render correctly inside the desktop tab shell:
1. Stop and surface the issue.
2. The only acceptable fix is to add an **opt-in prop with a default that preserves current web behavior**, so the existing Next.js app renders identically. No prop, no behavior change for web.
3. Non-trivial changes to web files require explicit approval before proceeding.

### Production API
- Base URL: `https://dashki-production.up.railway.app`
- The desktop bundle is built with `process.env.NEXT_PUBLIC_API_URL` defined to the URL above. The existing `web/src/lib/api.ts` reads this variable at module load and requires no edits.

## Architecture

**Approach:** Electron shell wrapping a Vite-built React bundle that imports the existing journal and foods page components directly from `web/src/`.

```
dashki/
├── web/                              # existing Next.js app — UNTOUCHED
├── server/                           # existing backend — UNTOUCHED
└── desktop/                          # new, fully independent npm project
    ├── electron/
    │   ├── main.ts                   # Electron main process (window, tray, auto-launch)
    │   ├── preload.ts                # IPC bridge (auto-launch get/set)
    │   └── assets/
    │       ├── tray-icon.png         # 16x16 / 32x32
    │       └── app-icon.ico          # taskbar + installer
    ├── src/
    │   ├── App.tsx                   # 2-tab shell + custom title bar
    │   ├── TopTabs.tsx               # Journal | Foods tab control
    │   ├── TitleBar.tsx              # Frameless-window drag region + min/close buttons
    │   ├── SettingsModal.tsx         # Auto-start toggle
    │   ├── main.tsx                  # React entry
    │   └── index.css                 # imports ../../web/src/app/globals.css
    ├── index.html                    # forces <html class="dark">
    ├── vite.config.ts                # alias '@' → ../web/src ; define NEXT_PUBLIC_API_URL
    ├── tailwind.config.ts            # content globs cover ../web/src + ./src
    ├── postcss.config.js
    ├── tsconfig.json                 # paths: '@/*' → '../web/src/*'
    ├── electron-builder.yml          # Windows NSIS installer config
    └── package.json
```

### Source-sharing mechanics

- `vite.config.ts` resolves `@` to `../web/src`, so:
  - `import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui'` resolves to the real web UI components.
  - `import JournalPage from '@/app/journal/page'` resolves to the real journal page.
  - `import FoodsPage from '@/app/foods/page'` resolves to the real foods page.
  - `import * as api from '@/lib/api'` resolves to the real API client.
- Tailwind's `content` globs include both `../web/src/**/*.{ts,tsx}` and `./src/**/*.{ts,tsx}` so all utility classes used by the imported pages get included in the desktop CSS bundle.
- `desktop/src/index.css` does `@import "../../web/src/app/globals.css";` — single source of truth for design tokens, CSS variables, and animations.
- `desktop/package.json` is independent: its own `node_modules`, its own React 18 + Tailwind 3 + lucide-react versions matching `web/package.json` exactly.

## UX Flow

### Launch sequence (every Windows boot)
1. Windows Startup runs the installed app silently with `--hidden`.
2. Electron creates the tray icon. **No window opens.**
3. The app sits in the tray until the user clicks it.

### Window
- Single `BrowserWindow`, **frameless** (`frame: false`), 1100×800 default.
- Custom title bar inside React (`TitleBar.tsx`):
  - CSS `-webkit-app-region: drag` on the title bar surface, `no-drag` on the buttons.
  - Three buttons on the right: Settings (gear), Minimize, Close.
  - Title bar styled to extend the Glass design to the top edge.
- Window size + position persisted via `electron-window-state`.
- Closing via the **X** button **hides** the window (overrides default close-to-quit). The process stays alive in the tray.

### Tray icon
- **Left-click:** toggle window — show if hidden, hide if visible.
- **Right-click:** context menu with `Show Dashki` / `Quit Dashki`.
- Tray icon assets in `desktop/electron/assets/`.

### Top tabs
- A horizontal tab bar at the top of the content area (below the custom title bar) with two tabs: **Journal** | **Foods**.
- Tab styling uses existing Glass tokens: `bg-white/5`, `border-white/10`, `rounded-2xl`. Active tab gets the existing accent treatment.
- Last-active tab persisted to `localStorage` under key `dashki-desktop:active-tab`. Reopens on next launch.
- Switching tabs unmounts the previous page and mounts the new one (no keep-alive).

### Settings modal
- Opened by clicking the gear icon in the title bar.
- Built with the existing `GlassModal` component, size `sm`.
- Single control in v1: an "Auto-start on Windows boot" checkbox.
- Toggle reads/writes via IPC to the Electron main process, which calls `app.getLoginItemSettings()` / `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`.

### Theme
- Dark mode is forced. `index.html` ships `<html class="dark">`. No theme toggle.

## Data Flow

- All API calls go through the existing `web/src/lib/api.ts`, unmodified, hitting `https://dashki-production.up.railway.app`.
- Real-time updates: existing `useSocketEvent` hook is imported as-is. Socket connects to the same Railway host (the existing `lib/socket.ts` derives the host from the API base URL).
- User preferences (goals, last-active tab) live in `localStorage` inside Electron's persistent profile at `%AppData%\Dashki Desktop\`.

## Auto-Launch

- Implemented via Electron's built-in `app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })` — no third-party package.
- "First launch ever" is detected via a sentinel file `bootstrapped.json` in Electron's `app.getPath('userData')` directory. When absent, the app sets `openAtLogin: true` and writes the sentinel. On subsequent launches the sentinel is present, so the user's choice in the settings modal is the source of truth.
- The settings modal reads the current value via `app.getLoginItemSettings().openAtLogin` (over IPC) and writes via `app.setLoginItemSettings(...)`.

## Single-Instance Lock

- `app.requestSingleInstanceLock()` at startup. If the lock is already held (user clicked the shortcut while the app was already in the tray), the second instance immediately quits and the first instance's window is shown and focused via the `second-instance` event.

## Build & Distribution

### Dev loop
- `cd desktop && npm run dev`
- Runs Vite dev server + Electron in watch mode concurrently (via `concurrently` + `wait-on`).
- HMR works for edits to both `desktop/src/**` and `web/src/**` (the latter because Vite watches the aliased directory).

### Production build
- `npm run build`:
  1. `vite build` → `desktop/dist/`
  2. `tsc -p electron/tsconfig.json` → `desktop/dist-electron/`
  3. `electron-builder --win nsis` → `desktop/release/Dashki Desktop Setup x.y.z.exe`
- Install location: `%LocalAppData%\Programs\Dashki Desktop\` (per-user, no admin required).
- Auto-start registration happens at app runtime, not at install time. The installer needs no special privileges.

### Versioning
- Single source of truth: `desktop/package.json` `version` field.
- v1.0.0 for the initial release.

## Components Inventory (new code)

| File | Purpose | Approx LOC |
|------|---------|-----------:|
| `electron/main.ts` | App lifecycle, window creation, tray, single-instance, IPC handlers | ~120 |
| `electron/preload.ts` | Exposes `window.electronAPI` for auto-launch get/set | ~15 |
| `src/main.tsx` | React 18 createRoot entry | ~10 |
| `src/App.tsx` | Tab state + composition of TitleBar, TopTabs, active page | ~50 |
| `src/TitleBar.tsx` | Drag region, gear/min/close buttons | ~40 |
| `src/TopTabs.tsx` | Two-tab control with Glass styling | ~35 |
| `src/SettingsModal.tsx` | Auto-start toggle UI | ~50 |
| `index.html` | Mount point, dark-mode class | ~15 |
| `vite.config.ts` | Alias, define, build config | ~30 |
| `tailwind.config.ts` | Content globs covering both projects | ~20 |
| Total new TS/TSX | | **~385** |

## Verification (manual smoke checklist)

Run on the **built `.exe`**, not dev mode:

1. Fresh install → app appears in tray, no window opens.
2. Click tray icon → window opens. Journal tab loads. Today's entries fetch from Railway successfully.
3. Switch to Foods tab → list loads. Search works. Create a test food → it persists.
4. Edit the test food → change persists. Delete it → it disappears.
5. Add a journal entry from the Journal tab → it appears immediately (socket event fires; verify by tailing entries on the live web app simultaneously).
6. Network verification: confirm via DevTools Network tab that all requests target `https://dashki-production.up.railway.app`, **not** `localhost:4000`.
7. Click window's X button → window hides, app stays in tray.
8. Click tray icon again → window reopens at the same size and position, on the same tab as last time.
9. Right-click tray → "Quit Dashki" → process exits cleanly.
10. Reboot Windows → app appears in tray automatically with no window.
11. Open settings modal → uncheck "Auto-start on boot" → reboot → app does NOT start. Re-enable.
12. Visual diff (optional, only if a deployed web URL exists): open the live web app's `/journal` and `/foods` pages in Chrome side-by-side with the desktop app on the same tabs. Confirm pixel-level parity (modulo the title bar and tab bar). If no deployed web URL is available, run the local web app via `cd web && npm run dev` and compare against `http://localhost:3000`.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Imported page accidentally needs a Next.js feature we missed | Confirmed via grep — pages use only React, lucide, local UI components, lib/api, lib/types, useSocketEvent. None of those touch `next/*`. If a future change to the web page introduces a `next/*` import, the desktop build will fail loudly at build time. |
| Tailwind classes used by imported pages get tree-shaken out | Tailwind `content` globs include `../web/src/**/*.{ts,tsx}`. Verified during smoke check by visual diff. |
| Web app's globals.css later changes in a way that breaks desktop | Acceptable — globals.css is the source of truth; desktop should follow web. If a regression appears, fix the import or revert. |
| Railway API rate limits or downtime | Out of scope. The desktop app has the same dependency the web app does. |
| Socket.io connection from Electron's origin (`file://`) blocked by CORS | The server already accepts socket connections from arbitrary origins for the web app; if not, this is a server config item flagged during smoke check. |

## Out of Scope (explicitly deferred)

- Auto-update via `electron-updater`
- macOS / Linux builds
- Code signing (the `.exe` will trigger a SmartScreen warning on first run; acceptable for personal use)
- Notifications
- Offline mode / local cache
- Authentication
- Settings beyond the auto-start toggle
