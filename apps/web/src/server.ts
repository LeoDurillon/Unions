import path from 'node:path';

import { serveStatic } from '@hono/bun';
import { maxProjectFileBytes, migrateDb, openDb } from '@union/core';

import { createApp } from './app';

const DEFAULT_PORT = 3000;
/** Room for the request around the largest upload (a project file). */
const REQUEST_ENVELOPE_BYTES = 1_048_576;

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
  maxRequestBodySize: maxProjectFileBytes() + REQUEST_ENVELOPE_BYTES,
  fetch: app.fetch,
};
