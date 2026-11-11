import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The Android app is built from the website's own source (../web/src): same pages,
// same look, every feature. Next.js-only imports are swapped for small stand-ins
// in src/shims, and src/ adds the phone extras (Samsung Health, widgets, updates).
const web = path.resolve(__dirname, '../web');

/** The web layout renders <body>; inside the app it is a plain div in #root. */
function webCompat(): Plugin {
  return {
    name: 'dashki-web-compat',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(web)) return;
      let out = code.replace(/^\s*['"]use client['"];?/m, '');
      if (id.endsWith(path.join('components', 'AppShell.tsx'))) {
        out = out.replace(/<body\b/g, '<div id="dashki-body"').replace(/<\/body>/g, '</div>');
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  return {
    // styled-jsx: the web pages use Next's <style jsx> blocks (phone-width layouts).
    plugins: [webCompat(), react({ babel: { plugins: ['styled-jsx/babel'] } })],
    publicDir: path.join(web, 'public'),
    define: {
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(env.VITE_API_BASE_URL || 'http://localhost:4000'),
    },
    resolve: {
      alias: [
        { find: /^next\/link$/, replacement: path.resolve(__dirname, 'src/shims/link.tsx') },
        { find: /^next\/navigation$/, replacement: path.resolve(__dirname, 'src/shims/navigation.ts') },
        { find: /^@\//, replacement: path.join(web, 'src') + '/' },
      ],
      // The web folder has its own node_modules: always use this app's copy.
      dedupe: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'recharts', 'socket.io-client', 'clsx', 'styled-jsx'],
    },
    server: { port: 5173, host: true, fs: { allow: [__dirname, web] } },
    preview: { port: 5173 },
    build: { chunkSizeWarningLimit: 1500 },
  };
});
