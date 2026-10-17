import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { markAgentInputsSent, pendingAgentInputs } from './agent-inputs';
import {
  CiOutputError,
  dropCiOutput,
  keepCiOutputs,
  listCiOutputs,
  sendCiOutputs,
  type NewCiOutput,
} from './ci-outputs';
import { finishContainerRun, keepForAgent, queueContainerRun } from './container-runs';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';
import { createTicket, type Ticket } from './tickets';

let db: Db;
let ticketId: number;

const CHECK: NewCiOutput = {
  headSha: 'abc',
  kind: 'check',
  name: 'Tests',
  url: 'https://x/1',
  text: '## Failed check: Tests',
};

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'T' }).id;
});

function setPhase(phase: Ticket['phase']): void {
  db.update(schema.tickets).set({ phase }).where(eq(schema.tickets.id, ticketId)).run();
}

function revisions(): number {
  return db.select().from(schema.commands).where(eq(schema.commands.type, 'revise')).all().length;
}

test('keeping the same check again on the same commit updates it', () => {
  const [first] = keepCiOutputs(db, ticketId, [CHECK]);
  const [again] = keepCiOutputs(db, ticketId, [{ ...CHECK, text: 'newer' }]);
  expect(again?.id).toBe(first?.id ?? -1);
  expect(again?.text).toBe('newer');
  const [other] = keepCiOutputs(db, ticketId, [{ ...CHECK, headSha: 'def' }]);
  expect(other?.id).not.toBe(first?.id ?? -1);
  expect(listCiOutputs(db, ticketId)).toHaveLength(2);
});

test('empty picks and empty texts are refused', () => {
  expect(() => keepCiOutputs(db, ticketId, [])).toThrow(CiOutputError);
  expect(() => keepCiOutputs(db, ticketId, [{ ...CHECK, text: ' ' }])).toThrow(CiOutputError);
});

test('sending queues one revision with the note, only when the implementer can take it', () => {
  setPhase({ kind: 'running', step: 'implement' });
  expect(() => sendCiOutputs(db, ticketId, [CHECK], 'fix')).toThrow(CiOutputError);
  expect(listCiOutputs(db, ticketId)).toHaveLength(0);
  setPhase({ kind: 'done' });
  const job: NewCiOutput = { ...CHECK, kind: 'job', name: 'Knip report' };
  expect(sendCiOutputs(db, ticketId, [CHECK, job], 'fix')).toHaveLength(2);
  const [command] = db.select().from(schema.commands).all();
  expect(command).toMatchObject({ type: 'revise', ticketId, payload: { feedback: 'fix' } });
  expect(revisions()).toBe(1);
});

test('the next run reads command and CI outputs together, once', () => {
  const run = queueContainerRun(db, { ticketId, command: 'bun test' });
  finishContainerRun(db, run.id, { status: 'failed', exitCode: 1, error: null, output: 'red' });
  keepForAgent(db, run.id, true);
  keepCiOutputs(db, ticketId, [CHECK]);
  const given = pendingAgentInputs(db, ticketId);
  expect(given.commands.map((r) => r.id)).toEqual([run.id]);
  expect(given.ci.map((c) => c.name)).toEqual(['Tests']);
  markAgentInputsSent(db, given);
  expect(pendingAgentInputs(db, ticketId)).toEqual({ commands: [], ci: [] });
  expect(listCiOutputs(db, ticketId).map((c) => c.forAgent)).toEqual(['sent']);
});

test('taking back: only before the agent read it', () => {
  const [kept] = keepCiOutputs(db, ticketId, [CHECK]);
  const id = kept?.id ?? -1;
  expect(dropCiOutput(db, ticketId, id).forAgent).toBeNull();
  expect(listCiOutputs(db, ticketId)).toHaveLength(0);
  keepCiOutputs(db, ticketId, [CHECK]);
  markAgentInputsSent(db, pendingAgentInputs(db, ticketId));
  const [sent] = listCiOutputs(db, ticketId);
  expect(() => dropCiOutput(db, ticketId, sent?.id ?? -1)).toThrow(CiOutputError);
  expect(() => dropCiOutput(db, ticketId + 1, sent?.id ?? -1)).toThrow(CiOutputError);
});
