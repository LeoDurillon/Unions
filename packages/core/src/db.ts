import { Database } from 'bun:sqlite';
import path from 'node:path';

import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import * as schema from './schema';

export type Db = BunSQLiteDatabase<typeof schema>;

/** One handle per process, safe across hot reloads. Web and worker open the same file (WAL). */
declare global {
  var __unionDb: Db | undefined;
}

/** Fresh handle, never cached: tests use `createDb(':memory:')`. */
export function createDb(file: string): Db {
  const sqlite = new Database(file, { create: true });
  sqlite.run('PRAGMA journal_mode = WAL');
  sqlite.run('PRAGMA busy_timeout = 5000');
  sqlite.run('PRAGMA foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

/**
 * Absolute, so web and worker share one file whatever directory they start from
 * (a relative default once gave each process its own empty database).
 */
export const DEFAULT_DB_PATH = path.resolve(import.meta.dir, '..', '..', '..', 'union.sqlite');

export function openDb(file = process.env.DB_PATH ?? DEFAULT_DB_PATH): Db {
  const cached = globalThis.__unionDb;
  if (cached) {
    return cached;
  }
  const db = createDb(file);
  globalThis.__unionDb = db;
  return db;
}

export function migrateDb(db: Db): void {
  migrate(db, { migrationsFolder: path.join(import.meta.dir, '..', 'drizzle') });
}
