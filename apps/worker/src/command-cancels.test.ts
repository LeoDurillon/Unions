import { expect, test } from 'bun:test';

import { createDb, createTicket, latestReport, migrateDb, queueReport, schema } from '@union/core';

import { cancelRun } from './command-cancels';
import { NO_HOOKS } from './command-hooks';

test('cancel_review_report cancels a queued report, and needs its id', () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const owner = { kind: 'ticket' as const, id: createTicket(db, { projectId, title: 'T' }).id };
  const queued = queueReport(db, owner, [{ id: 1, kind: 'ticket', label: 'Ticket', text: 'x' }]);
  cancelRun(db, { type: 'cancel_review_report', payload: { reportId: queued.id } }, NO_HOOKS);
  expect(latestReport(db, owner)?.status).toBe('cancelled');
  expect(() => {
    cancelRun(db, { type: 'cancel_review_report', payload: {} }, NO_HOOKS);
  }).toThrow('needs a numeric "reportId"');
});
