import path from 'node:path';

import { serveStatic } from '@hono/bun';
import { migrateDb, openDb } from '@union/core';

import { createApp } from './app';

const DEFAULT_PORT = 3000;

const db = openDb();
migrateDb(db);
const app = createApp(db);

if (process.env.NODE_ENV === 'production') {
  const dist = path.relative(process.cwd(), path.join(import.meta.dir, '..', 'dist'));
  app.use('/*', serveStatic({ root: dist }));
  app.get('*', serveStatic({ path: path.join(dist, 'index.html') }));
}

export default {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  idleTimeout: 0, // SSE streams are long-lived
  fetch: app.fetch,
};
