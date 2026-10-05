import { createApp } from './app';
import { env } from './config/env';
import { disconnectDb } from './db/client';
import { closeRealtime, attachRealtime } from './lib/realtime';
import { logger } from './lib/logger';
import { startAppointmentReminders } from './modules/sales/services/appointmentReminders';

const server = createApp().listen(env.PORT, () => {
  logger.info(`DMS API listening on http://localhost:${env.PORT}`);
});
// Live notifications (Socket.IO on /socket.io, same port as the API).
attachRealtime(server);
// "Appointment today" reminders for the leads' salesperson, Assistant Manager and Manager.
const stopReminders = startAppointmentReminders();

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopReminders();
  closeRealtime();
  server.close(() => {
    void disconnectDb().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
