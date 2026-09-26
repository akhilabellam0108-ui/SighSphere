import react from '@vitejs/plugin-react';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Writes dist/precache.json: every built file, so the service worker (public/sw.js) can
 * store the whole app — every screen, the tracking models, the sign pack — on first visit. */
function precacheList(): Plugin {
  let outDir = 'dist';
  return {
    name: 'signsphere-precache-list',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir.startsWith('/') ? config.build.outDir : join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      const skip = new Set(['sw.js', 'index.html', '404.html', 'precache.json']);
      writeFileSync(join(outDir, 'precache.json'), JSON.stringify(files.filter((f) => !skip.has(f) && !f.endsWith('.map')).sort()));
    },
  };
}

export default defineConfig({
  // Set BASE_PATH=/SighSphere/ when building for GitHub Pages; '/' everywhere else.
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [react(), precacheList()],
  // .env lives at the repo root (see .env.example).
  envDir: '../..',
  server: {
    port: 5173,
    // Camera needs a secure context. localhost qualifies, so plain HTTP is fine in dev.
    // To test on a phone on your LAN you need HTTPS — use `vite --host` behind a tunnel
    // (cloudflared / ngrok) rather than fighting self-signed certs.
    host: true,
  },
  optimizeDeps: {
    // Workspace source dependency — let Vite transform it rather than pre-bundling.
    exclude: ['@signsphere/gloss'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // MediaPipe is large; split it so the app shell loads fast on 3G.
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
});
