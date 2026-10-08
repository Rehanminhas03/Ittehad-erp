import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './http/errorHandler';
import { buildOpenApiDocument } from './http/openapi';
import { logger } from './lib/logger';
import { servedRouters } from './modules';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(helmet());
  app.use(cors({ origin: 'https://ittehad-erp-frontend-production.up.railway.app', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.requestId = req.get('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });
  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).requestId ?? randomUUID(), autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  const openapi = buildOpenApiDocument();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openapi);
  });

  // The OpenAPI document above still describes every module (the frontend client is generated from it).
  for (const r of servedRouters) app.use(r.mountPath, r.router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
