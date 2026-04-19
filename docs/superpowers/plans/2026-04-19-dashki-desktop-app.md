# Dashki Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows tray-resident Electron desktop app that exposes only the Food Journal and Foods database pages from the existing Dashki web app, hitting the Railway production API.

**Architecture:** A new `desktop/` npm project containing an Electron shell wrapping a Vite-built React bundle. The Vite bundle imports the existing `JournalPage` and `FoodsPage` components directly from `web/src/` via a path alias — zero file modifications inside `web/` or `server/`. Frameless window with custom title bar, lives in the system tray, auto-starts on Windows boot.

**Tech Stack:** Electron 30+, electron-builder (NSIS), Vite 5 + `vite-plugin-electron`, React 18, Tailwind 3 (matching web), TypeScript, lucide-react, socket.io-client.

**Spec:** [`docs/superpowers/specs/2026-04-19-dashki-desktop-app-design.md`](../specs/2026-04-19-dashki-desktop-app-design.md)

**Hard constraint (from spec):** No file inside `web/` or `server/` may be created, modified, or deleted. Verified at end of every task with `git status`.

---

## File Inventory

| Path | Created in task | Purpose |
|------|-----------------|---------|
| `desktop/package.json` | 1 | npm project definition, scripts, deps |
| `desktop/tsconfig.json` | 1 | Renderer TS config with `@/*` → `../web/src/*` alias |
| `desktop/tsconfig.node.json` | 1 | TS config for Vite + Electron build files |
| `desktop/vite.config.ts` | 1 | Vite + react + electron plugin, alias, define API URL |
| `desktop/postcss.config.js` | 1 | Tailwind/autoprefixer pipeline |
| `desktop/tailwind.config.ts` | 1 | Content globs covering both `./src` and `../web/src` |
| `desktop/index.html` | 2 | Mount point, forces `<html class="dark">` |
| `desktop/src/main.tsx` | 2 | React 18 entry |
| `desktop/src/index.css` | 2 | `@import` of `../../web/src/app/globals.css` + Tailwind directives |
| `desktop/src/App.tsx` | 2 → 3 → 5 | Composition root: TitleBar + TopTabs + active page |
| `desktop/src/TopTabs.tsx` | 3 | Two-tab control with Glass styling |
| `desktop/electron/main.ts` | 4 → 6 → 7 | Electron main process |
| `desktop/electron/preload.ts` | 4 → 7 | IPC bridge exposing `window.electronAPI` |
| `desktop/electron/assets/tray-icon.png` | 6 | Copied from `web/public/web/icon-192.png` |
| `desktop/electron/assets/app-icon.ico` | 6 | Copied from `web/public/web/favicon.ico` |
| `desktop/src/TitleBar.tsx` | 5 → 7 | Frameless window drag region + min/close/settings buttons |
| `desktop/src/SettingsModal.tsx` | 7 | Auto-start toggle UI |
| `desktop/electron-builder.yml` | 8 | Windows NSIS installer config |
| `desktop/.gitignore` | 1 | Ignores node_modules, dist, dist-electron, release |

**Testing posture:** No automated unit tests (per spec — this is a personal-use tray app of ~385 LOC of glue). Verification is **manual smoke checks at the end of each task** plus the final smoke checklist from the spec.

---

## Task 1: Scaffold the desktop npm project

**Goal:** A `desktop/` directory with an installable, buildable shell — empty Vite app that produces a `dist/` folder. No Electron yet, no React content yet.

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/tsconfig.node.json`
- Create: `desktop/vite.config.ts`
- Create: `desktop/postcss.config.js`
- Create: `desktop/tailwind.config.ts`
- Create: `desktop/.gitignore`

- [ ] **Step 1: Confirm we're on master and the working tree is clean**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git status
```

Expected: `On branch master`, "nothing to commit, working tree clean" (or only the `.claude/` files, which are unrelated).

- [ ] **Step 2: Create `desktop/` directory**

```bash
mkdir -p desktop/src desktop/electron/assets
```

- [ ] **Step 3: Create `desktop/.gitignore`**

```gitignore
node_modules/
dist/
dist-electron/
release/
*.log
.DS_Store
```

- [ ] **Step 4: Create `desktop/package.json`**

Versions chosen to match `web/package.json` exactly for shared deps (React 18, lucide-react ^0.383, socket.io-client ^4.7).

```json
{
  "name": "dashki-desktop",
  "version": "1.0.0",
  "description": "Dashki desktop tray app — Journal and Foods only",
  "private": true,
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.node.json && vite build && electron-builder --win nsis",
    "build:vite": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "electron-window-state": "^5.0.3",
    "lucide-react": "^0.383.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7",
    "socket.io-client": "^4.7.4"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "electron": "^30.0.0",
    "electron-builder": "^24.13.3",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5",
    "vite": "^5.2.10",
    "vite-plugin-electron": "^0.28.6",
    "vite-plugin-electron-renderer": "^0.14.5"
  }
}
```

- [ ] **Step 5: Create `desktop/tsconfig.json`** (renderer config, mirrors web's compiler options + adds the `@/*` alias pointing into `web/src`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowJs": false,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["../web/src/*"]
    }
  },
  "include": ["src", "../web/src"],
  "exclude": ["node_modules", "dist", "dist-electron", "release"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: Create `desktop/tsconfig.node.json`** (for Vite config + Electron main/preload, which run in Node)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false,
    "outDir": "dist-electron",
    "types": ["node"]
  },
  "include": ["vite.config.ts", "electron/**/*.ts"]
}
```

- [ ] **Step 7: Create `desktop/postcss.config.js`** (identical to web's)

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Create `desktop/tailwind.config.ts`** — imports the web app's config to inherit `theme.extend` (custom colors `glass`/`primary`/`accent`/`bg`, animations, keyframes, fonts) so the imported pages render correctly. Single source of truth lives in `web/tailwind.config.ts`.

```ts
import type { Config } from 'tailwindcss';
import webConfig from '../web/tailwind.config';

const config: Config = {
  ...webConfig,
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../web/src/**/*.{ts,tsx}',
  ],
};

export default config;
```

This works because `tsconfig.node.json` (Step 6) is configured for ESM module resolution, and Vite's PostCSS pipeline can resolve TypeScript Tailwind configs via tsx. If running this config produces "Cannot find module '../web/tailwind.config'" during `npm run dev`, install `tsx` as a devDep (`npm install -D tsx`) and confirm Vite picks it up.

- [ ] **Step 9: Create `desktop/vite.config.ts`** (renderer-only for now; Electron plugin added in Task 4)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const PROD_API_URL = 'https://dashki-production.up.railway.app';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '../web/src'),
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(PROD_API_URL),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
```

- [ ] **Step 10: Install dependencies**

```bash
cd desktop && npm install
```

Expected: completes without errors. Will take 30-90s. Some peer dep warnings from Electron are normal — only treat actual `npm ERR!` lines as failures.

- [ ] **Step 11: Verify Vite is wired up by running build (will fail because no `index.html` yet — that's expected)**

```bash
cd desktop && npm run build:vite
```

Expected: a `Could not resolve entry module "index.html"` error. This proves Vite is installed and reading the config correctly. We'll add `index.html` in Task 2.

- [ ] **Step 12: Verify isolation guarantee — nothing in `web/` or `server/` was modified**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty output (no changes under those directories).

- [ ] **Step 13: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/.gitignore desktop/package.json desktop/package-lock.json desktop/tsconfig.json desktop/tsconfig.node.json desktop/postcss.config.js desktop/tailwind.config.ts desktop/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(desktop): scaffold desktop project (vite + tailwind, no electron yet)

Adds desktop/ as an independent npm project with React 18, Tailwind 3,
and Vite 5. Path alias '@' resolves to web/src so the renderer can
import the existing journal/foods pages directly. NEXT_PUBLIC_API_URL
is baked into the bundle as the Railway production URL.

No files in web/ or server/ are touched.
EOF
)"
```

---

## Task 2: Render the imported `JournalPage` in a browser via Vite

**Goal:** Open `npm run dev`, see the real Journal page rendered in a browser tab, with API requests successfully hitting Railway.

**Files:**
- Create: `desktop/index.html`
- Create: `desktop/src/main.tsx`
- Create: `desktop/src/index.css`
- Create: `desktop/src/App.tsx`

- [ ] **Step 1: Create `desktop/index.html`** — note the `class="dark"` on `<html>`, which mirrors how the web app shows dark mode

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dashki Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `desktop/src/index.css`** — single line that imports the web app's globals.css. The imported file already contains the `@tailwind base/components/utilities` directives at its top plus all CSS custom properties — single source of truth.

```css
@import "../../web/src/app/globals.css";
```

- [ ] **Step 3: Create `desktop/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Create `desktop/src/App.tsx`** — minimal version that just renders JournalPage to confirm the import path + globals work

```tsx
import JournalPage from '@/app/journal/page';

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <JournalPage />
    </div>
  );
}
```

- [ ] **Step 5: Run the Vite dev server**

```bash
cd desktop && npm run dev
```

Expected: Vite prints `Local: http://localhost:5174/`. No build errors. (Some warnings about `'use client'` directives are normal — Vite ignores them as no-ops.)

- [ ] **Step 6: Open the page in a browser and verify**

Open `http://localhost:5174` in Chrome. **Manual checks:**
1. The Journal page renders with dark-mode Glass styling (no white-flash, dark background, glassy cards).
2. Open DevTools → Network. Confirm requests go to `https://dashki-production.up.railway.app/api/...` (NOT `localhost:4000`).
3. Today's journal entries load successfully (status 200).
4. No console errors related to missing modules, missing classes, or missing CSS variables.

If any of these fail, debug before moving on. Common issues:
- "Cannot resolve `@/components/ui`" → check `vite.config.ts` alias path is correct.
- API requests still go to localhost → the `define` substitution didn't work; restart Vite.
- White background instead of dark → `globals.css` import path is wrong, or `class="dark"` missing on `<html>`.
- Missing utility classes → Tailwind `content` globs don't reach `../web/src/`.

- [ ] **Step 7: Stop the dev server (Ctrl+C) and run a production build to confirm it builds clean**

```bash
cd desktop && npm run build:vite
```

Expected: a `dist/` folder with `index.html`, `assets/index-*.js`, `assets/index-*.css`. No errors.

- [ ] **Step 8: Verify isolation guarantee**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 9: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/index.html desktop/src/main.tsx desktop/src/index.css desktop/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): render imported JournalPage via Vite

Renders the real web app's JournalPage component in a browser via the
'@/*' alias. globals.css is imported directly from web/src — single
source of truth. API requests confirmed routing to Railway production.
EOF
)"
```

---

## Task 3: Add the two-tab shell (Journal | Foods)

**Goal:** Replace the single-page render with a 2-tab top bar that swaps between `JournalPage` and `FoodsPage`. Active tab persisted to localStorage.

**Files:**
- Create: `desktop/src/TopTabs.tsx`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 1: Create `desktop/src/TopTabs.tsx`**

```tsx
import clsx from 'clsx';

export type TabId = 'journal' | 'foods';

interface TopTabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'foods', label: 'Foods' },
];

export default function TopTabs({ active, onChange }: TopTabsProps) {
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-white/10 bg-white/[0.02]">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'px-4 py-2 rounded-2xl text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Replace `desktop/src/App.tsx`** with the tabbed version (persisting `activeTab` to localStorage)

```tsx
import { useEffect, useState } from 'react';
import JournalPage from '@/app/journal/page';
import FoodsPage from '@/app/foods/page';
import TopTabs, { type TabId } from './TopTabs';

const STORAGE_KEY = 'dashki-desktop:active-tab';

function readInitialTab(): TabId {
  if (typeof window === 'undefined') return 'journal';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'foods' ? 'foods' : 'journal';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(readInitialTab);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <TopTabs active={activeTab} onChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {activeTab === 'journal' ? <JournalPage /> : <FoodsPage />}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Run dev server**

```bash
cd desktop && npm run dev
```

- [ ] **Step 4: Manual verification**

Open `http://localhost:5174`. Check:
1. Top bar shows two tabs: Journal (active) | Foods.
2. Clicking Foods switches to the Foods page; the food list loads from Railway.
3. Clicking Journal switches back; journal entries reload.
4. Refresh the page. The last-active tab is the one that opens (verifies localStorage persistence).
5. Open DevTools → Application → Local Storage → check key `dashki-desktop:active-tab` updates as you click.

- [ ] **Step 5: Stop dev server, build to confirm no regressions**

```bash
cd desktop && npm run build:vite
```

Expected: clean build.

- [ ] **Step 6: Verify isolation**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/src/TopTabs.tsx desktop/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): two-tab shell (Journal | Foods) with localStorage persistence
EOF
)"
```

---

## Task 4: Wrap the renderer in an Electron window

**Goal:** Running `npm run dev` opens an Electron window (not a browser) showing the tabbed shell. Frameless, but no custom title bar yet.

**Files:**
- Create: `desktop/electron/main.ts`
- Create: `desktop/electron/preload.ts`
- Modify: `desktop/vite.config.ts`
- Modify: `desktop/package.json` (no edits needed — `main` field is already set)

- [ ] **Step 1: Create `desktop/electron/preload.ts`** (empty stub for now — populated in Task 7)

```ts
// Preload script. Currently empty; extended in Task 7 with auto-launch IPC.
export {};
```

- [ ] **Step 2: Create `desktop/electron/main.ts`** (window-only for now; tray + close-to-tray + single-instance added in Task 6)

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Update `desktop/vite.config.ts`** to add the electron plugin

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'path';

const PROD_API_URL = 'https://dashki-production.up.railway.app';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-window-state'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, '../web/src'),
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(PROD_API_URL),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
```

- [ ] **Step 4: Run dev**

```bash
cd desktop && npm run dev
```

Expected: An Electron window opens (frameless — just a dark rectangle with the two-tab bar at the top). DevTools opens detached. No browser tab opens.

- [ ] **Step 5: Manual verification inside the Electron window**

1. Tab bar visible at the top, Journal page renders below.
2. Switch to Foods tab — list loads from Railway.
3. DevTools Network tab shows requests to `https://dashki-production.up.railway.app`.
4. The window has NO title bar / chrome (it's frameless). You cannot drag it (we'll fix that in Task 5).
5. Close the window via Ctrl+W or by killing the process — the app exits cleanly (we'll change close-to-tray behavior in Task 6).

- [ ] **Step 6: Stop dev (Ctrl+C in the terminal)**

If Ctrl+C doesn't kill it cleanly, find the electron process in Task Manager and end it. This is normal during this transition; cleanup is improved in Task 6.

- [ ] **Step 7: Verify isolation**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/electron/main.ts desktop/electron/preload.ts desktop/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(desktop): wrap renderer in frameless Electron window

Adds electron main + preload, vite-plugin-electron orchestration.
Window is frameless, 1100x800, with no chrome. Tray, close-to-hide,
and single-instance lock are added in subsequent tasks.
EOF
)"
```

---

## Task 5: Custom title bar (drag region + minimize/close buttons)

**Goal:** A draggable title bar at the top of the frameless window with minimize and close buttons. (Settings gear added in Task 7.)

**Files:**
- Create: `desktop/src/TitleBar.tsx`
- Modify: `desktop/src/App.tsx`
- Modify: `desktop/electron/preload.ts`
- Modify: `desktop/electron/main.ts`

- [ ] **Step 1: Update `desktop/electron/preload.ts`** to expose window control IPC

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowClose: () => ipcRenderer.send('window:close'),
});

export {};
```

- [ ] **Step 2: Update `desktop/electron/main.ts`** to handle the IPC events. Add this BEFORE the `app.on('window-all-closed', ...)` line:

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:close', () => mainWindow?.close());

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Create `desktop/src/TitleBar.tsx`**

```tsx
import { Minus, X } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      windowMinimize: () => void;
      windowClose: () => void;
    };
  }
}

export default function TitleBar() {
  return (
    <div
      className="flex items-center justify-between h-10 bg-black/80 border-b border-white/5 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-4 text-xs uppercase tracking-wider text-white/40">
        Dashki
      </div>
      <div
        className="flex"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => window.electronAPI.windowMinimize()}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => window.electronAPI.windowClose()}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-red-500 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `desktop/src/App.tsx`** to render `TitleBar` above `TopTabs`

```tsx
import { useEffect, useState } from 'react';
import JournalPage from '@/app/journal/page';
import FoodsPage from '@/app/foods/page';
import TopTabs, { type TabId } from './TopTabs';
import TitleBar from './TitleBar';

const STORAGE_KEY = 'dashki-desktop:active-tab';

function readInitialTab(): TabId {
  if (typeof window === 'undefined') return 'journal';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'foods' ? 'foods' : 'journal';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(readInitialTab);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <TitleBar />
      <TopTabs active={activeTab} onChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {activeTab === 'journal' ? <JournalPage /> : <FoodsPage />}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Run dev**

```bash
cd desktop && npm run dev
```

- [ ] **Step 6: Manual verification**

1. The window now has a 40px-tall title bar at the top showing "DASHKI" on the left.
2. Click and drag the title bar — the window moves.
3. Click the minus button — the window minimizes to the taskbar; click the taskbar entry to restore.
4. Click the X button — the window closes and (since we haven't added close-to-tray yet) the app exits.
5. The minimize and close buttons are NOT draggable (you can click them without the window moving).

- [ ] **Step 7: Stop dev**

- [ ] **Step 8: Verify isolation**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 9: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/src/TitleBar.tsx desktop/src/App.tsx desktop/electron/main.ts desktop/electron/preload.ts
git commit -m "$(cat <<'EOF'
feat(desktop): custom title bar with drag region and minimize/close

Adds a 40px frameless title bar with WebKit drag region. Min/close
buttons IPC to the main process. Settings gear (Task 7) and
close-to-tray (Task 6) handled separately.
EOF
)"
```

---

## Task 6: Tray icon, close-to-tray, single-instance lock

**Goal:** Closing the window hides it to the system tray instead of quitting. Tray icon left-click toggles the window. Right-click shows a Show/Quit menu. Re-launching the app while it's already running just surfaces the existing window.

**Files:**
- Create: `desktop/electron/assets/tray-icon.png` (copied from `web/public/web/icon-192.png`)
- Create: `desktop/electron/assets/app-icon.ico` (copied from `web/public/web/favicon.ico`)
- Modify: `desktop/electron/main.ts`

- [ ] **Step 1: Copy the tray icon and app icon from the web project's public folder**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
cp web/public/web/icon-192.png desktop/electron/assets/tray-icon.png
cp web/public/web/favicon.ico desktop/electron/assets/app-icon.ico
```

Verify both files exist:

```bash
ls desktop/electron/assets/
```

Expected: `app-icon.ico  tray-icon.png`

- [ ] **Step 2: Update `desktop/electron/main.ts`** with tray, close-to-hide, single-instance lock, and window state persistence

Replace the entire file contents with:

```ts
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
// @ts-ignore — no type defs published
import windowStateKeeper from 'electron-window-state';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const ASSETS_DIR = path.join(__dirname, '../electron/assets');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createWindow() {
  const winState = windowStateKeeper({
    defaultWidth: 1100,
    defaultHeight: 800,
  });

  const startHidden = process.argv.includes('--hidden');

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    icon: path.join(ASSETS_DIR, 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  winState.manage(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray-icon.png'));
  const trayIcon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Dashki');

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashki',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Dashki',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:close', () => mainWindow?.hide());

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Don't quit when all windows are closed — we live in the tray.
app.on('window-all-closed', (event: Electron.Event) => {
  event.preventDefault();
});
```

Note: `window:close` IPC now hides instead of closing — since the title bar X is the user's "I'm done" signal in this app's UX, it should behave like the window's X (hide-to-tray), not quit.

- [ ] **Step 3: Run dev**

```bash
cd desktop && npm run dev
```

- [ ] **Step 4: Manual verification**

1. App opens with the window visible. A tray icon appears in the Windows system tray (bottom-right, may be in the overflow `^` menu).
2. Click the title bar X — window disappears, tray icon stays.
3. Left-click the tray icon — window reappears.
4. Left-click the tray icon again — window hides.
5. Right-click the tray icon — context menu shows "Show Dashki" / "Quit Dashki".
6. Click "Show Dashki" — window reappears.
7. Resize and move the window to a new position. Click the title bar X to hide. Click the tray icon to show — window returns to the same position and size (`electron-window-state` working).
8. **Single-instance:** while the app is running with the window hidden, run `npm run dev` again in a second terminal. The new process should exit immediately and the original window should pop to front.
9. Right-click the tray icon → "Quit Dashki" — process fully exits, tray icon disappears.

- [ ] **Step 5: Stop dev (if still running) and verify isolation**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/electron/main.ts desktop/electron/assets/tray-icon.png desktop/electron/assets/app-icon.ico
git commit -m "$(cat <<'EOF'
feat(desktop): system tray, close-to-hide, single-instance lock

- Tray icon (reuses web/public/web/icon-192.png).
- Closing the window hides to tray; only "Quit Dashki" tray menu exits.
- Single-instance lock surfaces the existing window on relaunch.
- Window position/size persisted via electron-window-state.
- --hidden arg (used by auto-start in Task 7) launches without showing the window.
EOF
)"
```

---

## Task 7: Settings modal with auto-start toggle

**Goal:** A gear icon in the title bar opens a small settings modal containing an "Auto-start on Windows boot" checkbox. On first launch ever, auto-start defaults to ON.

**Files:**
- Create: `desktop/src/SettingsModal.tsx`
- Modify: `desktop/src/TitleBar.tsx`
- Modify: `desktop/src/App.tsx`
- Modify: `desktop/electron/preload.ts`
- Modify: `desktop/electron/main.ts`

- [ ] **Step 1: Update `desktop/electron/preload.ts`** to add auto-launch IPC

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowClose: () => ipcRenderer.send('window:close'),
  getAutoLaunch: (): Promise<boolean> => ipcRenderer.invoke('autolaunch:get'),
  setAutoLaunch: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('autolaunch:set', enabled),
});

export {};
```

- [ ] **Step 2: Update `desktop/electron/main.ts`** — add the bootstrap sentinel logic and the IPC handlers

Add these imports at the top (after the existing imports):

```ts
import fs from 'node:fs';
```

Add this function near the top of the file (after the `gotLock` block, before `createWindow`):

```ts
function bootstrapAutoLaunchOnFirstRun() {
  const sentinelPath = path.join(app.getPath('userData'), 'bootstrapped.json');
  if (fs.existsSync(sentinelPath)) return;

  app.setLoginItemSettings({
    openAtLogin: true,
    args: ['--hidden'],
  });
  fs.writeFileSync(sentinelPath, JSON.stringify({ bootstrapped: true, ts: Date.now() }));
}
```

Add these IPC handlers near the existing `ipcMain.on(...)` lines:

```ts
ipcMain.handle('autolaunch:get', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('autolaunch:set', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? ['--hidden'] : [],
  });
});
```

Update the `app.whenReady()` block to call the bootstrap function:

```ts
app.whenReady().then(() => {
  bootstrapAutoLaunchOnFirstRun();
  createWindow();
  createTray();
});
```

- [ ] **Step 3: Create `desktop/src/SettingsModal.tsx`** — uses the existing `GlassModal` from web's UI

```tsx
import { useEffect, useState } from 'react';
import { GlassModal } from '@/components/ui';

declare global {
  interface Window {
    electronAPI: {
      windowMinimize: () => void;
      windowClose: () => void;
      getAutoLaunch: () => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<void>;
    };
  }
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.electronAPI.getAutoLaunch().then((value) => {
      if (!cancelled) setAutoLaunch(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggle = async (enabled: boolean) => {
    setAutoLaunch(enabled);
    await window.electronAPI.setAutoLaunch(enabled);
  };

  return (
    <GlassModal open={open} onClose={onClose} title="Settings" size="sm">
      <div className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoLaunch ?? false}
            disabled={autoLaunch === null}
            onChange={(e) => handleToggle(e.target.checked)}
            className="mt-1 w-4 h-4 rounded accent-white"
          />
          <div>
            <div className="font-medium text-white">Auto-start on Windows boot</div>
            <div className="text-sm text-white/60">
              Dashki will launch silently in the system tray when you sign in.
            </div>
          </div>
        </label>
      </div>
    </GlassModal>
  );
}
```

- [ ] **Step 4: Update `desktop/src/TitleBar.tsx`** to add the gear button and a callback prop

```tsx
import { Minus, X, Settings } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      windowMinimize: () => void;
      windowClose: () => void;
      getAutoLaunch: () => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<void>;
    };
  }
}

interface TitleBarProps {
  onOpenSettings: () => void;
}

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
  return (
    <div
      className="flex items-center justify-between h-10 bg-black/80 border-b border-white/5 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-4 text-xs uppercase tracking-wider text-white/40">
        Dashki
      </div>
      <div
        className="flex"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={onOpenSettings}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={() => window.electronAPI.windowMinimize()}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => window.electronAPI.windowClose()}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-red-500 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `desktop/src/App.tsx`** to manage settings modal state and pass the callback

```tsx
import { useEffect, useState } from 'react';
import JournalPage from '@/app/journal/page';
import FoodsPage from '@/app/foods/page';
import TopTabs, { type TabId } from './TopTabs';
import TitleBar from './TitleBar';
import SettingsModal from './SettingsModal';

const STORAGE_KEY = 'dashki-desktop:active-tab';

function readInitialTab(): TabId {
  if (typeof window === 'undefined') return 'journal';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'foods' ? 'foods' : 'journal';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(readInitialTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <TopTabs active={activeTab} onChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {activeTab === 'journal' ? <JournalPage /> : <FoodsPage />}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 6: Run dev**

```bash
cd desktop && npm run dev
```

- [ ] **Step 7: Manual verification**

1. The title bar now shows a gear icon to the left of minimize.
2. Click the gear → settings modal opens with the GlassModal style. The auto-start checkbox shows the current state.
3. Toggle the checkbox off, close the modal, reopen — checkbox is still off (verifies persistence).
4. **Verify it actually changed Windows startup:** open Task Manager → Startup tab. Look for "Electron" or "Dashki" entry. Its status should match the checkbox.
5. Toggle back on. Confirm Task Manager updates.
6. Close the modal via the GlassModal's own close button. Confirm modal dismisses.
7. **First-launch sentinel test:** quit the app fully (tray → Quit). Delete the sentinel file:
   ```bash
   # PowerShell or Git Bash:
   rm "$env:APPDATA/dashki-desktop/bootstrapped.json"
   ```
   Then `npm run dev` again. Open settings — auto-launch should be ON (default for first run). Re-check Task Manager Startup tab to confirm.

- [ ] **Step 8: Stop dev**

- [ ] **Step 9: Verify isolation**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 10: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/src/SettingsModal.tsx desktop/src/TitleBar.tsx desktop/src/App.tsx desktop/electron/preload.ts desktop/electron/main.ts
git commit -m "$(cat <<'EOF'
feat(desktop): settings modal with auto-start toggle

Adds a gear button in the title bar that opens a GlassModal containing
an 'Auto-start on Windows boot' checkbox. Backed by Electron's
setLoginItemSettings via IPC. First launch writes a sentinel file
in userData/ and defaults auto-start to ON.
EOF
)"
```

---

## Task 8: Production build and Windows installer (electron-builder)

**Goal:** Run `npm run build` once and get a `Dashki Desktop Setup 1.0.0.exe` installer that installs the app, registers auto-start, and runs from the tray.

**Files:**
- Create: `desktop/electron-builder.yml`
- Modify: `desktop/package.json` (add `build` config block / app metadata if needed)

- [ ] **Step 1: Create `desktop/electron-builder.yml`**

```yaml
appId: com.terry.dashki-desktop
productName: Dashki Desktop
copyright: Copyright © 2026 Terry Truong

directories:
  output: release
  buildResources: electron/assets

files:
  - dist/**/*
  - dist-electron/**/*
  - electron/assets/**/*
  - package.json

asar: true

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: electron/assets/app-icon.ico

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Dashki Desktop
```

- [ ] **Step 2: Run a clean production build**

```bash
cd desktop
rm -rf dist dist-electron release
npm run build
```

Expected: takes 1-3 minutes. Final output: a file at `desktop/release/Dashki Desktop Setup 1.0.0.exe` (and some support files).

If electron-builder complains about missing icon sizes, the `.ico` we copied may not contain all required sizes. In that case, install `png-to-ico` and convert from `web/public/web/icon-256.png`:

```bash
npx png-to-ico web/public/web/icon-512.png > desktop/electron/assets/app-icon.ico
```

Then re-run the build.

- [ ] **Step 3: Verify the installer was produced**

```bash
ls desktop/release/
```

Expected to include: `Dashki Desktop Setup 1.0.0.exe` (and a `.blockmap` file).

- [ ] **Step 4: Install the app**

Double-click `desktop/release/Dashki Desktop Setup 1.0.0.exe`. Windows SmartScreen will warn about an unrecognized publisher (this is expected — the app is unsigned). Click "More info" → "Run anyway".

Walk through the installer:
- Choose installation directory (default `%LocalAppData%\Programs\Dashki Desktop\` is fine).
- Confirm "Create desktop shortcut" is checked.
- Click Install.

Expected: installer completes, app launches automatically (window opens).

- [ ] **Step 5: Manual smoke verification on the installed app**

1. The desktop shortcut "Dashki Desktop" exists.
2. The Start menu shortcut "Dashki Desktop" exists.
3. The window is open with the title bar, tab bar, and Journal page rendered.
4. **Crucial:** open settings — the auto-start checkbox is ON (this is the first-ever launch of the installed binary, so the bootstrap sentinel ran).
5. Open Task Manager → Startup → confirm "Dashki Desktop" or "Electron" is listed and Enabled.
6. Switch to Foods tab — Railway data loads.
7. Close window via X — hides to tray.
8. Click tray icon — window returns.
9. Right-click tray → Quit Dashki.

- [ ] **Step 6: Verify isolation**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki && git status web/ server/
```

Expected: empty.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git add desktop/electron-builder.yml
# also include app-icon.ico if it was regenerated
git status desktop/electron/assets/
git add desktop/electron/assets/app-icon.ico
git commit -m "$(cat <<'EOF'
feat(desktop): production build via electron-builder (NSIS)

Adds electron-builder.yml producing a per-user NSIS installer at
desktop/release/. App installs to %LocalAppData%\Programs\Dashki Desktop\,
creates desktop and start-menu shortcuts. Auto-start is registered
on first launch by the app itself (no installer privileges needed).
EOF
)"
```

---

## Task 9: Final smoke checklist (full system test on the installed binary)

**Goal:** Walk the spec's full Verification checklist on the installed `.exe`. Document any failures and fix before declaring done.

**Files:** none (verification only)

- [ ] **Step 1: Reboot Windows**

Save anything important first. After reboot:
1. **Expected:** Dashki tray icon appears in the system tray with no window opening.
2. If a window opens: check that the auto-start command in Task Manager → Startup → Properties includes `--hidden` in the args. If not, fix in `electron/main.ts`'s `bootstrapAutoLaunchOnFirstRun` and rebuild.

- [ ] **Step 2: Run the spec's smoke checklist** (from `docs/superpowers/specs/2026-04-19-dashki-desktop-app-design.md`, "Verification" section)

For each numbered item, perform the action and tick a mental checkbox. Items 1–11 from the spec; item 12 (visual diff) is optional per the spec.

- [ ] **Step 3: If any check fails, file inline notes**

Write a short note in the commit message of the fix commit describing what failed and how it was fixed. Don't accumulate fixes — fix one thing, commit, move to the next.

- [ ] **Step 4: Final isolation verification — make sure NOTHING in web/ or server/ was modified throughout the entire project**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git log --since="this implementation started" --name-only | grep -E "^(web/|server/)" | sort -u
```

Expected: empty output. If any file in `web/` or `server/` shows up, that's a hard violation of the spec's isolation guarantee — STOP and revert.

- [ ] **Step 5: Tag the release**

```bash
cd C:/Users/Terry/.openclaw/workspace/Dashki
git tag -a desktop-v1.0.0 -m "Dashki Desktop v1.0.0"
```

- [ ] **Step 6: Final commit / wrap-up note**

If there were any fix commits in step 3, the work is already in the log. If not, no commit needed — just confirm the work is complete and the smoke checklist passes.

---

## Done

The desktop app:
- Installs from `desktop/release/Dashki Desktop Setup 1.0.0.exe`
- Auto-starts silently on Windows boot to the system tray
- Renders the real Journal and Foods pages from `web/src/` against the Railway production API
- Looks visually identical to the web app's pages (same components, same CSS)
- Has zero footprint inside `web/` or `server/`
