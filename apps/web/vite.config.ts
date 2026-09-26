import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
