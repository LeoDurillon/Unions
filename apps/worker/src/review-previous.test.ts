import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, saveOutput, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { previousReview, previousReviewSection } from './review-previous';

let db: Db;
let ticketId: number;

function output(
  step: 'implement' | 'final_review',
  content: string,
  extra: { feedback?: string; headSha?: string } = {},
): void {
  const row = saveOutput(db, ticketId, step, content);
  db.update(schema.stepOutputs)
    .set({ feedback: extra.feedback ?? null, headSha: extra.headSha ?? null })
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

test('a branch never reviewed has no earlier review', () => {
  output('implement', 'report');
  expect(previousReview(db, ticketId)).toBeNull();
});

test('the latest review comes with its commit and every feedback sent after it', () => {
  output('final_review', 'old review', { feedback: 'old feedback', headSha: 'aaa' });
  output('implement', 'report');
  output('final_review', 'VERDICT: CHANGES_REQUESTED\n- null check', {
    feedback: 'fix the null check',
    headSha: 'bbb',
  });
  output('implement', 'report 2', { feedback: 'fix the lint errors' });
  output('implement', 'report 3');
  expect(previousReview(db, ticketId)).toEqual({
    content: 'VERDICT: CHANGES_REQUESTED\n- null check',
    headSha: 'bbb',
    feedback: ['fix the null check', 'fix the lint errors'],
  });
});

test('the re-review is pointed at the commits since, or at the base when they cannot be told apart', () => {
  const previous = { content: '- null check', headSha: 'bbb', feedback: ['fix it'] };
  const since = previousReviewSection(previous, 'in_history');
  expect(since).toContain('- null check');
  expect(since).toContain('fix it');
  expect(since).toContain('git diff bbb..HEAD');
  expect(since).toContain('never raise again a point the user declined');
  expect(previousReviewSection(previous, 'rewritten')).not.toContain('git diff bbb..HEAD');
  expect(previousReviewSection(previous, 'rewritten')).toContain('no longer in the branch');
  expect(previousReviewSection({ ...previous, headSha: null }, 'unknown')).toContain(
    'not recorded',
  );
});
