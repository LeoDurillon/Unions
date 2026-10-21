// Says whether anything runs on the live instance; exits 1 if so (before editing worker/core files or restarting).
import { Database } from 'bun:sqlite';
import path from 'node:path';

import { ACTIVE_WORK } from '@union/core';

const file = process.env.DB_PATH ?? path.resolve(import.meta.dir, '..', 'union.sqlite');
const db = new Database(file, { readonly: true });
const tables = new Set(
  db
    .query<{ name: string }, []>("select name from sqlite_master where type = 'table'")
    .all()
    .map((row) => row.name),
);
// A table a migration has not created yet counts 0.
const counts = ACTIVE_WORK.map(
  ({ table, where }) =>
    [
      table,
      tables.has(table)
        ? (db.query<{ n: number }, []>(`select count(*) as n from ${table} where ${where}`).get()
            ?.n ?? 0)
        : 0,
    ] as const,
);
db.close();
const busy = counts.filter(([, n]) => n > 0);
if (busy.length > 0) {
  console.log(`Active: ${busy.map(([table, n]) => `${table} ${n}`).join(', ')}.`);
  console.log('Do not edit worker or core files, or restart web/worker, until they end.');
  process.exitCode = 1;
} else {
  console.log('Nothing is running.');
}
