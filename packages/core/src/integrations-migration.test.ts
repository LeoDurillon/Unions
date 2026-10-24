import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import * as schema from './tables';

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: path.join(import.meta.dir, '..', 'drizzle'),
});
const INTEGRATIONS = MIGRATIONS.findIndex((migration) =>
  migration.sql.some((statement) => statement.includes('CREATE TABLE `integrations`')),
);
const SOURCE = '11111111-2222-4333-8444-555555555555';
const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const COLUMNS = [{ id: 's%3At', name: 'Status', type: 'status', options: ['Todo'] }];

function apply(sqlite: Database, migrations: typeof MIGRATIONS): void {
  for (const statement of migrations.flatMap((migration) => migration.sql)) {
    if (statement.trim() !== '') {
      sqlite.run(statement);
    }
  }
}

function insertProject(
  sqlite: Database,
  repo: string,
  token: string | null,
  config: object,
): number {
  const row = sqlite
    .query<{ id: number }, [string, string | null, string]>(
      "INSERT INTO projects (owner, repo, notion_token, config) VALUES ('o', ?, ?, ?) RETURNING id",
    )
    .get(repo, token, JSON.stringify({ baseBranch: 'main', ...config }));
  if (!row) {
    throw new Error('no project inserted');
  }
  return row.id;
}

/** Projects as they were: connected with columns read, connected without a data source, not connected. */
function seed(sqlite: Database): { read: number; bare: number; plain: number } {
  const read = insertProject(sqlite, 'read', 'secret_a', { notionDataSourceId: SOURCE });
  const bare = insertProject(sqlite, 'bare', 'secret_b', {});
  const plain = insertProject(sqlite, 'plain', null, {});
  sqlite.run(
    "INSERT INTO notion_data_sources (project_id, data_source_id, title, properties, fetched_at) VALUES (?, ?, 'Roadmap', ?, 42)",
    [read, SOURCE, JSON.stringify(COLUMNS)],
  );
  sqlite.run(
    "INSERT INTO tickets (project_id, title, notion_page_id) VALUES (?, 'From Notion', ?), (?, 'Written here', NULL)",
    [read, PAGE, read],
  );
  sqlite.run(
    "INSERT INTO investigations (project_id, title, prompt, scope, model, tools, ticket_in_notion) VALUES (?, 'Q', 'Q', 'global', 'opus', '[]', 1), (?, 'Q', 'Q', 'global', 'opus', '[]', 0)",
    [read, read],
  );
  return { read, bare, plain };
}

test('the integrations migration copies Notion connections, ticket pages and investigation targets', () => {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  apply(sqlite, MIGRATIONS.slice(0, INTEGRATIONS));
  const { read, bare } = seed(sqlite);

  apply(sqlite, MIGRATIONS.slice(INTEGRATIONS));

  const { integrations } = schema;
  const rows = drizzle(sqlite, { schema })
    .select({
      project_id: integrations.projectId,
      kind: integrations.kind,
      secret: integrations.secret,
      config: integrations.config,
      fields: integrations.fields,
      title: integrations.title,
      fields_read_at: integrations.fieldsReadAt,
    })
    .from(integrations)
    .orderBy(integrations.projectId)
    .all();
  expect(rows).toEqual([
    {
      project_id: read,
      kind: 'notion',
      secret: 'secret_a',
      config: { dataSourceId: SOURCE },
      fields: { title: 'Roadmap', properties: COLUMNS },
      title: 'Roadmap',
      fields_read_at: 42,
    },
    {
      project_id: bare,
      kind: 'notion',
      secret: 'secret_b',
      config: {},
      fields: null,
      title: '',
      fields_read_at: null,
    },
  ]);
  expect(
    sqlite.query('SELECT title, origin_kind, origin_id, origin_url FROM tickets ORDER BY id').all(),
  ).toEqual([
    {
      title: 'From Notion',
      origin_kind: 'notion',
      origin_id: PAGE,
      origin_url: `https://www.notion.so/${PAGE.replaceAll('-', '')}`,
    },
    { title: 'Written here', origin_kind: null, origin_id: null, origin_url: null },
  ]);
  expect(sqlite.query('SELECT ticket_target FROM investigations ORDER BY id').all()).toEqual([
    { ticket_target: 'notion' },
    { ticket_target: null },
  ]);
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
});
