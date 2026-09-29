import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/client';
import { closeRealtime, attachRealtime } from './lib/realtime';
import { logger } from './lib/logger';

const server = createApp().listen(env.PORT, () => {
  logger.info(`DMS API listening on http://localhost:${env.PORT}`);
});
// Live notifications (Socket.IO on /socket.io, same port as the API).
attachRealtime(server);

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  closeRealtime();
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
