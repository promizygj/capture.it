import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { suitesRouter } from './routes/suites.js';
import { runsRouter } from './routes/runs.js';
import { ciRouter } from './routes/ci.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, contentSecurityPolicy: false }));
  app.use(cors({ origin: config.APP_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/ci', ciRouter);
  app.use('/api', suitesRouter);
  app.use('/api', runsRouter);
  app.use('/api', notFoundHandler);

  // A tiny demo website that the predefined templates can be tried against
  app.use('/demo', express.static(path.resolve(here, '../demo-site'), { extensions: ['html'] }));
  app.get('/demo/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0', items: [{ id: 1, name: 'Widget' }] }));
  app.get('/demo/api/broken', (_req, res) => res.status(500).json({ error: 'Internal error' }));

  // In production the API also serves the built React app
  const web = path.resolve(here, '../../frontend/dist');
  if (config.isProd) {
    app.use(express.static(web, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|demo).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
