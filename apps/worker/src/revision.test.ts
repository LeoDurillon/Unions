import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  migrateDb,
  recordValidation,
  saveOutput,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { drainCommands } from './commands';
import { revisionFor } from './revision';

let db: Db;
let ticketId: number;

function output(
  step: 'implement' | 'final_review',
  content: string,
  validation: 'pending' | 'approved' | 'revise',
  feedback?: string,
): void {
  const row = saveOutput(db, ticketId, step, content);
  db.update(schema.stepOutputs)
    .set({ validation, feedback: feedback ?? null })
    .where(eq(schema.stepOutputs.id, row.id))
    .run();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

test('no feedback, no revision', () => {
  output('implement', 'report', 'approved');
  expect(revisionFor(db, ticketId, 'implement')).toBeNull();
});

test('feedback on a step revises that step', () => {
  output('implement', 'report', 'revise', 'rename it');
  expect(revisionFor(db, ticketId, 'implement')).toEqual({
    previous: 'report',
    feedback: 'rename it',
  });
});

test('feedback on the final review is addressed by the implementer', () => {
  output('implement', 'report v1', 'approved');
  output('final_review', 'VERDICT: CHANGES_REQUESTED', 'revise', 'fix the null check');
  expect(revisionFor(db, ticketId, 'implement')).toEqual({
    previous: 'report v1',
    feedback: 'fix the null check',
  });
  expect(revisionFor(db, ticketId, 'final_review')).toEqual({
    previous: 'VERDICT: CHANGES_REQUESTED',
    feedback: 'fix the null check',
  });
});

test('once the implementer has answered, the old review feedback no longer applies', () => {
  output('implement', 'report v1', 'approved');
  output('final_review', 'VERDICT: CHANGES_REQUESTED', 'revise', 'fix it');
  output('implement', 'report v2', 'pending');
  expect(revisionFor(db, ticketId, 'implement')).toBeNull();
});

test('a review sent on a done ticket reaches the implementer through the final review', () => {
  output('implement', 'Implemented.', 'approved');
  output('final_review', 'VERDICT: APPROVED', 'approved');
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  recordValidation(db, ticketId, { status: 'revise', feedback: 'Rename the helper.' });
  expect(revisionFor(db, ticketId, 'implement')).toEqual({
    previous: 'Implemented.',
    feedback: 'Rename the helper.',
  });
  // Approving needs a ticket waiting on the user: a done ticket has nothing to approve.
  expect(() => {
    recordValidation(db, ticketId, { status: 'approved' });
  }).toThrow('not awaiting approval');
});

test('the worker takes the revise command on a done ticket and starts the implementer', () => {
  output('final_review', 'VERDICT: APPROVED', 'approved');
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  db.insert(schema.commands)
    .values({ type: 'revise', ticketId, payload: { feedback: 'Rename the helper.' } })
    .run();
  drainCommands(db);
  expect(getTicket(db, ticketId).phase).toEqual({
    kind: 'running',
    step: 'implement',
    thenRun: 'final_review',
  });
  expect(db.select().from(schema.commands).get()?.error).toBeNull();
});
