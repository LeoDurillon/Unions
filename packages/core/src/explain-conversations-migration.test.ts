// Tests the migration that turns explanation threads into Explain conversations, their lines into subjects.

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import path from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: path.join(import.meta.dir, '..', 'drizzle'),
});
const CONVERSATIONS = MIGRATIONS.findIndex((migration) =>
  migration.sql.some((statement) =>
    statement.includes('CREATE TABLE `review_explain_conversations`'),
  ),
);

function apply(sqlite: Database, migrations: typeof MIGRATIONS): void {
  for (const statement of migrations.flatMap((migration) => migration.sql)) {
    if (statement.trim() !== '') {
      sqlite.run(statement);
    }
  }
}

const INSERT = `INSERT INTO review_explanations
  (ticket_id, parent_id, path, side, start_line, end_line, excerpt, question, specs, head_sha, status, session_id, created_at)
  VALUES (?, ?, ?, 'new', ?, ?, 'code', ?, '[]', 'abc', 'succeeded', ?, ?) RETURNING id`;

/** A ticket with two threads: lines 3-5 asked twice, then line 9 asked with a question. */
function seed(sqlite: Database): { ticket: number; root: number; follow: number; other: number } {
  sqlite.run("INSERT INTO projects (owner, repo, config) VALUES ('o', 'r', '{}')");
  const ticket = sqlite
    .query<{ id: number }, []>(
      "INSERT INTO tickets (project_id, title) VALUES (1, 't') RETURNING id",
    )
    .get()?.id;
  if (ticket === undefined) {
    throw new Error('no ticket inserted');
  }
  const insert = sqlite.query<
    { id: number },
    [number, number | null, string, number, number, string | null, string, number]
  >(INSERT);
  const root = insert.get(ticket, null, 'src/a.ts', 3, 5, null, 's1', 100)?.id ?? 0;
  const follow = insert.get(ticket, root, 'src/a.ts', 3, 5, 'Why?', 's2', 200)?.id ?? 0;
  const other = insert.get(ticket, null, 'src/b.ts', 9, 9, 'What is this?', 's3', 150)?.id ?? 0;
  return { ticket, root, follow, other };
}

test('each thread becomes a conversation, each explanation a turn with its lines as one subject', () => {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  apply(sqlite, MIGRATIONS.slice(0, CONVERSATIONS));
  const { ticket, root, follow, other } = seed(sqlite);

  apply(sqlite, MIGRATIONS.slice(CONVERSATIONS));

  const conversations = sqlite
    .query('SELECT id, ticket_id, title, created_at, updated_at FROM review_explain_conversations')
    .all();
  expect(conversations).toEqual([
    { id: root, ticket_id: ticket, title: 'src/a.ts:3-5', created_at: 100, updated_at: 200 },
    { id: other, ticket_id: ticket, title: 'What is this?', created_at: 150, updated_at: 150 },
  ]);
  const turns = sqlite
    .query<{ id: number; conversation_id: number; subjects: string; session_id: string }, []>(
      'SELECT id, conversation_id, subjects, session_id FROM review_explanations ORDER BY id',
    )
    .all();
  expect(turns.map((turn) => [turn.id, turn.conversation_id, turn.session_id])).toEqual([
    [root, root, 's1'],
    [follow, root, 's2'],
    [other, other, 's3'],
  ]);
  expect(JSON.parse(turns[0]?.subjects ?? '[]')).toEqual([
    { kind: 'lines', path: 'src/a.ts', side: 'new', start: 3, end: 5, excerpt: 'code' },
  ]);
  const next = sqlite
    .query<{ id: number }, []>(
      "INSERT INTO review_explain_conversations (ticket_id, title) VALUES (1, 'n') RETURNING id",
    )
    .get();
  expect(next?.id).toBe(other + 1);
});
