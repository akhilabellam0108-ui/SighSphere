import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Emits /sw.js from sw.template.js with the build's full file list, so the service worker
 * precaches every chunk (including lazily loaded screens) and every public asset.
 * No plugin dependency: this is the whole implementation.
 */
function signsphereServiceWorker(): Plugin {
  return {
    name: 'signsphere-service-worker',
    apply: 'build',
    // Run after Vite's HTML plugin, which emits index.html late in generateBundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicDir = join(root, 'public');
      const publicFiles = listFiles(publicDir)
        .map((file) => `/${relative(publicDir, file).split('\\').join('/')}`)
        // Licence texts are for humans, not for the offline cache.
        .filter((path) => !path.endsWith('.txt'));
      const built = Object.keys(bundle).map((file) => `/${file}`);
      // index.html is the offline shell for every route; it must always be precached.
      const urls = [...new Set(['/index.html', ...built, ...publicFiles])].filter((url) => url !== '/sw.js').sort();

      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(join(root, 'sw.template.js'), 'utf8')
        .replace("'__SW_VERSION__'", JSON.stringify(version))
        .replace('const PRECACHE_URLS = __SW_PRECACHE__;', `const PRECACHE_URLS = ${JSON.stringify(urls, null, 2)};`);
      if (!Object.keys(bundle).includes('index.html')) {
        this.warn('index.html was not in the bundle when sw.js was generated.');
      }
      if (source.includes('= __SW_PRECACHE__') || source.includes("= '__SW_VERSION__'")) {
        this.error('sw.template.js placeholders were not replaced — check the template.');
      }

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), signsphereServiceWorker()],
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
