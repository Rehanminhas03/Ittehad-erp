import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // Same-origin API in dev so the httpOnly refresh cookie (Path=/api/auth) just works.
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false },
      // Live notifications (Socket.IO over WebSocket).
      '/socket.io': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false, ws: true },
    },
  },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
