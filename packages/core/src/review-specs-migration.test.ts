import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import path from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: path.join(import.meta.dir, '..', 'drizzle'),
});
const SPECS = MIGRATIONS.findIndex((migration) =>
  migration.sql.some((statement) => statement.includes('CREATE TABLE `review_specs`')),
);
const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function apply(sqlite: Database, migrations: typeof MIGRATIONS): void {
  for (const statement of migrations.flatMap((migration) => migration.sql)) {
    if (statement.trim() !== '') {
      sqlite.run(statement);
    }
  }
}

test("each review's linked Notion page becomes one of its specs; a review without one gets none", () => {
  const sqlite = new Database(':memory:');
  apply(sqlite, MIGRATIONS.slice(0, SPECS));
  sqlite.run("INSERT INTO projects (owner, repo, config) VALUES ('o', 'r', '{}')");
  sqlite.run(
    "INSERT INTO current_reviews (project_id, pr_number, title, url, author, head_branch, base_branch, notion_page_id, notion_title, notion_url) VALUES (1, 7, 't', 'u', 'a', 'h', 'main', ?, 'Export', 'https://n/p'), (1, 8, 't', 'u', 'a', 'h2', 'main', NULL, NULL, NULL)",
    [PAGE],
  );
  apply(sqlite, MIGRATIONS.slice(SPECS));
  expect(
    sqlite.query('SELECT review_id, kind, ref, label, url, text, removed FROM review_specs').all(),
  ).toEqual([
    {
      review_id: 1,
      kind: 'notion',
      ref: PAGE,
      label: 'Notion: Export',
      url: 'https://n/p',
      text: null,
      removed: 0,
    },
  ]);
});
