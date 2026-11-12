// Tests of what approving starts: the next step of the ticket's flow and the model it will run on, or nothing.

import { beforeEach, expect, test } from 'bun:test';

import { modelFor } from '../agent/agents';
import { createDb, migrateDb, type Db } from '../db';
import { projectPresets } from '../flow/flows';
import { afterApproval } from './approval-next';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('approving a planning step starts the next step of the ticket flow, on its model', () => {
  const next = afterApproval(db, {
    phase: { kind: 'awaiting_approval', step: 'technical' },
    flow: ['technical', 'implement', 'final_review'],
  });
  expect(next?.step).toBe('implement');
  expect(next?.model).toBe(modelFor(db, 'implement'));
  expect(
    afterApproval(db, { phase: { kind: 'awaiting_approval', step: 'technical' }, flow: null })
      ?.step,
  ).toBe('test_plan');
});

test('the last step, and a ticket not waiting, start nothing', () => {
  expect(
    afterApproval(db, { phase: { kind: 'awaiting_approval', step: 'final_review' }, flow: null }),
  ).toBeNull();
  expect(afterApproval(db, { phase: { kind: 'backlog' }, flow: null })).toBeNull();
});

test('a flow saved before descriptions existed takes the built-in one of its id', () => {
  const presets = projectPresets({
    baseBranch: 'main',
    flows: [
      { id: 'quick', name: 'Quick', steps: ['implement', 'final_review'] },
      { id: 'mine', name: 'Mine', steps: ['implement', 'final_review'] },
    ],
  });
  expect(presets[0]?.description).toContain('typo');
  expect(presets[1]?.description).toBeUndefined();
});
