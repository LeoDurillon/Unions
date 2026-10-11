import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, saveOutput, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

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
