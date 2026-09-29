/**
 * Live updates over Socket.IO (path /socket.io, next to the API). A signed-in browser connects with
 * its access token and joins its own room (`user:<id>`); the server pushes each new notification
 * to its recipients right after the change is saved. Without an attached server (tests, scripts)
 * publishing is a no-op.
 */
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { loadAccess } from '../auth/grants';
import { verifyAccessToken } from '../auth/tokens';
import { env } from '../config/env';
import { logger } from './logger';

let io: Server | null = null;
const room = (userId: number) => `user:${userId}`;

export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true },
  });
  // Same check as the API: a valid, current access token of an active user.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      const claims = token ? verifyAccessToken(token) : null;
      const access = claims ? await loadAccess(claims.userId, claims.tokenVersion) : null;
      if (!access) return next(new Error('unauthorized'));
      socket.data.userId = access.userId;
      next();
    } catch (err) {
      logger.warn({ err }, 'socket auth failed');
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    void socket.join(room(socket.data.userId as number));
  });
  return io;
}

/** Sends an event to each listed user (all their open tabs). */
export function emitToUsers(userIds: number[], event: string, payloadFor: (userId: number) => unknown) {
  if (!io) return;
  for (const id of userIds) io.to(room(id)).emit(event, payloadFor(id));
}

export function closeRealtime() {
  void io?.close();
  io = null;
}
