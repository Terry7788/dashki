import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'path';

const PROD_API_URL = 'https://dashki-production.up.railway.app';

// Bare specifiers used by web/src that must resolve to desktop/node_modules.
// Without these, Rollup walks up from web/ and fails (web/node_modules does
// not exist in this worktree).
const SHARED_DEPS = [
  'react',
  'react-dom',
  'react-dom/client',
  'lucide-react',
  'clsx',
  'socket.io-client',
  'recharts',
];

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
      'next/link': resolve(__dirname, 'src/shims/next-link.tsx'),
      ...Object.fromEntries(
        SHARED_DEPS.map((dep) => [dep, resolve(__dirname, 'node_modules', dep)]),
      ),
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
