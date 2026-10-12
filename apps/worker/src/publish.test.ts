import { expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, setParent } from '@union/core';
import { eq } from 'drizzle-orm';

import { pullRequestBody } from './publish';

test('a PR stacked on the parent branch names the parent PR', () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const parent = createTicket(db, { projectId: project.id, title: 'parent' }).id;
  const child = createTicket(db, { projectId: project.id, title: 'child' }).id;
  setParent(db, child, parent);
  db.update(schema.tickets)
    .set({ branch: '12-parent', prNumber: 40 })
    .where(eq(schema.tickets.id, parent))
    .run();
  db.update(schema.tickets).set({ issueNumber: 13 }).where(eq(schema.tickets.id, child)).run();

  // Parent branch already merged and deleted: the child was cloned from main.
  expect(pullRequestBody(db, getTicket(db, child))).toBe('Closes #13');

  db.update(schema.tickets)
    .set({ baseBranch: '12-parent' })
    .where(eq(schema.tickets.id, child))
    .run();
  expect(pullRequestBody(db, getTicket(db, child))).toBe(
    'Closes #13\n\nBuilds on #40, which it targets: merge that one first.',
  );
});
