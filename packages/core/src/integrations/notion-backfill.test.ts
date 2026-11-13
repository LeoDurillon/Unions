import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import * as schema from '../tables';
import { createTicket, getTicket } from '../ticket/tickets';
import { backfillNotionPages } from './notion-backfill';

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

test('tickets imported before the link was stored are linked from their description', () => {
  const imported = createTicket(db, {
    projectId,
    title: 'Old import',
    body: 'Text.\n\n---\nImported from Notion: https://www.notion.so/acme/Add-search-0123456789abcdef0123456789abcdef',
  });
  createTicket(db, { projectId, title: 'Local', body: 'Nothing here.' });
  expect(backfillNotionPages(db)).toBe(1);
  expect(getTicket(db, imported.id)).toMatchObject({
    originKind: 'notion',
    originId: '01234567-89ab-cdef-0123-456789abcdef',
  });
  expect(backfillNotionPages(db)).toBe(0);
});
