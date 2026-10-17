import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';
import {
  createTicket,
  dispatch,
  getTicket,
  latestOutput,
  recordValidation,
  saveOutput,
} from './tickets';

let db: Db;
let ticketId: number;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      githubProjectNodeId: 'P_1',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get();
  projectId = project.id;
  ticketId = createTicket(db, { projectId, title: 't' }).id;
});

test('dispatch persists the phase and emits phase_changed', () => {
  dispatch(db, ticketId, { type: 'start' });
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'running', step: 'intake' });
  const types = db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
  expect(types).toEqual(['ticket_created', 'phase_changed']);
});

test('an invalid action leaves the phase and events untouched', () => {
  expect(() => dispatch(db, ticketId, { type: 'approve' })).toThrow();
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'backlog' });
  expect(db.select().from(schema.events).all()).toHaveLength(1);
});

test('step outputs are versioned per step', () => {
  saveOutput(db, ticketId, 'intake', 'v1');
  saveOutput(db, ticketId, 'intake', 'v2');
  saveOutput(db, ticketId, 'summary', 's1');
  expect(latestOutput(db, ticketId, 'intake')?.content).toBe('v2');
  expect(latestOutput(db, ticketId, 'intake')?.version).toBe(2);
  expect(latestOutput(db, ticketId, 'summary')?.version).toBe(1);
});

test('revise stores feedback on the output and in the memory inbox', () => {
  dispatch(db, ticketId, { type: 'start' });
  saveOutput(db, ticketId, 'intake', 'draft');
  dispatch(db, ticketId, { type: 'run_finished' });
  recordValidation(db, ticketId, { status: 'revise', feedback: 'be terser' });
  expect(latestOutput(db, ticketId, 'intake')).toMatchObject({
    validation: 'revise',
    feedback: 'be terser',
  });
  expect(db.select().from(schema.feedbackEvents).all()).toMatchObject([
    { section: 'intake', text: 'be terser', ticketId },
  ]);
});

test('validation is rejected unless the ticket awaits approval', () => {
  expect(() => {
    recordValidation(db, ticketId, { status: 'approved' });
  }).toThrow();
});

test("starting fixes the ticket's flow, which its next approvals follow", () => {
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', defaultFlow: 'quick' } })
    .where(eq(schema.projects.id, projectId))
    .run();
  expect(dispatch(db, ticketId, { type: 'start' })).toEqual({ kind: 'running', step: 'implement' });
  expect(getTicket(db, ticketId).flow).toEqual(['implement', 'final_review']);
  // A preset changed after the start leaves the ticket's flow as it was.
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main' } })
    .where(eq(schema.projects.id, projectId))
    .run();
  dispatch(db, ticketId, { type: 'run_finished' });
  expect(dispatch(db, ticketId, { type: 'approve' })).toEqual({
    kind: 'running',
    step: 'final_review',
  });
});
