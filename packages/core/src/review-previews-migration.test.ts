import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import * as schema from './tables';

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: path.join(import.meta.dir, '..', 'drizzle'),
});
const OWNERS = MIGRATIONS.findIndex((migration) =>
  migration.sql.some((statement) => statement.includes('__new_previews')),
);

/** A ticket in the columns of that time: today's schema has columns the old table lacks. */
function insertTicket(sqlite: Database, projectId: number, title: string): number {
  const row = sqlite
    .query<{ id: number }, [number, string]>(
      'INSERT INTO tickets (project_id, title) VALUES (?, ?) RETURNING id',
    )
    .get(projectId, title);
  if (!row) {
    throw new Error('no ticket inserted');
  }
  return row.id;
}

function apply(sqlite: Database, migrations: typeof MIGRATIONS): void {
  for (const statement of migrations.flatMap((migration) => migration.sql)) {
    if (statement.trim() !== '') {
      sqlite.run(statement);
    }
  }
}

test("the owners migration keeps the tickets' previews and commands, in their projects", () => {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  apply(sqlite, MIGRATIONS.slice(0, OWNERS));
  const db = drizzle(sqlite, { schema });
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const first = insertTicket(sqlite, projectId, 'A');
  const second = insertTicket(sqlite, projectId, 'B');
  sqlite.run(
    `INSERT INTO previews (ticket_id, status, url, compose_yaml) VALUES (?, 'running', 'http://1.localhost', 'services: {}'), (?, 'stopped', NULL, NULL)`,
    [first, second],
  );
  sqlite.run(
    `INSERT INTO container_runs (id, ticket_id, command, timeout_sec, for_agent) VALUES (4, ?, 'ls', 60, 'next_run')`,
    [first],
  );

  apply(sqlite, MIGRATIONS.slice(OWNERS));

  expect(
    sqlite
      .query('SELECT ticket_id, review_id, project_id, status, url, compose_yaml FROM previews')
      .all(),
  ).toEqual([
    {
      ticket_id: first,
      review_id: null,
      project_id: projectId,
      status: 'running',
      url: 'http://1.localhost',
      compose_yaml: 'services: {}',
    },
    {
      ticket_id: second,
      review_id: null,
      project_id: projectId,
      status: 'stopped',
      url: null,
      compose_yaml: null,
    },
  ]);
  expect(
    sqlite.query('SELECT id, ticket_id, review_id, command, for_agent FROM container_runs').all(),
  ).toEqual([{ id: 4, ticket_id: first, review_id: null, command: 'ls', for_agent: 'next_run' }]);
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
});
