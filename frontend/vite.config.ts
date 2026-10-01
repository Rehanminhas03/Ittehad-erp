import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createLogger } from 'vite';
import { defineConfig } from 'vitest/config';

// A live-notification socket closed mid-write (tab closed or reloaded, backend restarted by
// `tsx watch`) is normal: the browser reconnects by itself. Vite would print each one as a
// "ws proxy error" stack trace. Those are dropped; a backend that is not reachable becomes one short
// line (at most every 10 s); other errors are shown as usual.
const logger = createLogger();
const logError = logger.error.bind(logger);
const SOCKET_DROPPED = /ECONNABORTED|ECONNRESET|EPIPE/;
let lastUnreachable = 0;
logger.error = (msg, options) => {
  if (msg.includes('ws proxy')) {
    const text = `${msg} ${options?.error?.message ?? ''}`;
    if (SOCKET_DROPPED.test(text)) return;
    if (text.includes('ECONNREFUSED')) {
      if (Date.now() - lastUnreachable > 10_000) logger.warn('Live notifications: backend not reachable yet (starting or restarting?), reconnecting…', { timestamp: true });
      lastUnreachable = Date.now();
      return;
    }
  }
  logError(msg, options);
};

export default defineConfig({
  customLogger: logger,
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
