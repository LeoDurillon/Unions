// Tests of the sidebar's counts: each project's tickets waiting on the user and running, by the board's rule.
import { expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema } from '@union/core';
import { eq } from 'drizzle-orm';

import { countsOf, projectCounts } from './project-counts';

test('each project counts its tickets that wait on the user and those running; one without tickets has zeros', () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const project = (repo: string): number =>
    db
      .insert(schema.projects)
      .values({ owner: 'o', repo, config: { baseBranch: 'main' } })
      .returning()
      .get().id;
  const busy = project('busy');
  const empty = project('empty');
  const phase = (id: number, value: typeof schema.tickets.$inferSelect.phase): void => {
    db.update(schema.tickets).set({ phase: value }).where(eq(schema.tickets.id, id)).run();
  };
  phase(createTicket(db, { projectId: busy, title: 'a' }).id, {
    kind: 'awaiting_approval',
    step: 'technical',
  });
  phase(createTicket(db, { projectId: busy, title: 'b' }).id, {
    kind: 'running',
    step: 'implement',
  });
  const red = createTicket(db, { projectId: busy, title: 'c' }).id;
  db.update(schema.tickets)
    .set({ prState: 'open', prChecksState: 'failure' })
    .where(eq(schema.tickets.id, red))
    .run();
  createTicket(db, { projectId: busy, title: 'd' });
  const counts = projectCounts(db);
  expect(countsOf(counts, busy)).toEqual({ needsYou: 2, running: 1 });
  expect(countsOf(counts, empty)).toEqual({ needsYou: 0, running: 0 });
});
