import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

import { closeDb, createDb, migrateDb } from './db';

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: path.join(import.meta.dir, '..', 'drizzle'),
});

function applied(file: string): number[] {
  const sqlite = new Database(file, { readonly: true });
  const rows = sqlite
    .query<{ at: number }, []>('SELECT created_at AS at FROM __drizzle_migrations ORDER BY id')
    .all();
  sqlite.close();
  return rows.map((row) => row.at);
}

test('migrating twice applies each migration once', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'union-db-')), 'union.sqlite');
  for (let round = 0; round < 2; round++) {
    const db = createDb(file);
    migrateDb(db);
    closeDb(db);
  }
  expect(applied(file)).toEqual(MIGRATIONS.map((migration) => migration.folderMillis));
});

test('processes starting together never apply the same migration twice', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'union-db-')), 'union.sqlite');
  const script = `import { createDb, migrateDb } from ${JSON.stringify(path.join(import.meta.dir, 'db.ts'))};
migrateDb(createDb(${JSON.stringify(file)}));`;
  const runs = Array.from({ length: 4 }, () =>
    Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' }),
  );
  const codes = await Promise.all(runs.map((run) => run.exited));
  const errors = await Promise.all(runs.map((run) => new Response(run.stderr).text()));
  expect(errors.filter((text) => text.trim() !== '')).toEqual([]);
  expect(codes).toEqual([0, 0, 0, 0]);
  expect(applied(file)).toEqual(MIGRATIONS.map((migration) => migration.folderMillis));
});
