import { Database } from 'bun:sqlite';
import path from 'node:path';

import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import * as schema from './tables';

export type Db = BunSQLiteDatabase<typeof schema>;

/** One handle per process, safe across hot reloads. Web and worker open the same file (WAL). */
declare global {
  var __unionDb: Db | undefined;
  var __unionSqlite: WeakMap<Db, Database> | undefined;
}

/** The SQLite connection under each handle; global too, or a hot reload would lose the cached one's. */
globalThis.__unionSqlite ??= new WeakMap<Db, Database>();
const handles = globalThis.__unionSqlite;

/** How long a write waits for another process's write (web and worker share the file). */
const BUSY_TIMEOUT_MS = 5000;

const WAL_ATTEMPTS = 100;
const WAL_RETRY_MS = 50;

function isBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'SQLITE_BUSY';
}

/**
 * Switches the file to WAL. On a new file opened by web and worker at once, SQLite can refuse the
 * switch as busy without waiting for the timeout, so it is retried for a few seconds.
 */
function enableWal(sqlite: Database): void {
  for (let attempt = 1; ; attempt++) {
    try {
      sqlite.run('PRAGMA journal_mode = WAL');
      return;
    } catch (error) {
      if (!isBusy(error) || attempt === WAL_ATTEMPTS) {
        throw error;
      }
      // createDb is synchronous for every caller; this only waits while another process creates the file.
      // oxlint-disable-next-line node/no-sync
      Bun.sleepSync(WAL_RETRY_MS);
    }
  }
}

/** Fresh handle, never cached: tests use `createDb(':memory:')`. */
export function createDb(file: string): Db {
  const sqlite = new Database(file, { create: true });
  sqlite.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  enableWal(sqlite);
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  handles.set(db, sqlite);
  return db;
}

/** Closes a handle from `createDb` (scripts and tests that open files directly). */
export function closeDb(db: Db): void {
  handles.get(db)?.close();
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

const MIGRATIONS_FOLDER = path.join(import.meta.dir, '..', 'drizzle');
/** drizzle-kit's bookkeeping table: one row per applied migration, keyed by its folder timestamp. */
const MIGRATIONS_TABLE = '__drizzle_migrations';
/** How long a process waits for another one's migrations to finish. */
const MIGRATION_WAIT_MS = 120_000;

/**
 * Applies the pending migrations, each statement as drizzle's migrator would, in one transaction.
 * Web and worker both run this at start. The write lock is taken (`BEGIN IMMEDIATE`) before reading
 * what is applied, so a second process waits, then finds nothing left to do. Drizzle's migrator reads
 * first and locks after, which let both apply the same migration and crash the later one.
 */
export function migrateDb(db: Db): void {
  const sqlite = handles.get(db);
  if (!sqlite) {
    throw new Error('migrateDb takes a handle from createDb or openDb');
  }
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  sqlite.run(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
  );
  const apply = sqlite.transaction(() => {
    const last = sqlite
      .query<{ at: number }, []>(
        `SELECT created_at AS at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`,
      )
      .get();
    const pending = migrations.filter((migration) => !last || last.at < migration.folderMillis);
    for (const migration of pending) {
      for (const statement of migration.sql) {
        if (statement.trim() !== '') {
          sqlite.run(statement);
        }
      }
      sqlite.run(`INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`, [
        migration.hash,
        migration.folderMillis,
      ]);
    }
  });
  sqlite.run(`PRAGMA busy_timeout = ${MIGRATION_WAIT_MS}`);
  try {
    apply.immediate();
  } finally {
    sqlite.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  }
}
