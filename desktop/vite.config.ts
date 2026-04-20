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
