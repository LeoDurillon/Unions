import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  AGENT_REPO_DIR,
  askFollowUp,
  claimTicketDraft,
  createDb,
  createInvestigation,
  createTicket,
  finishInvestigation,
  finishTicketDraft,
  getInvestigation,
  getTicket,
  migrateDb,
  requestTicket,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn, AgentRun } from './agent';
import { InvestigationRunner } from './investigate';
import { TICKET_INVESTIGATION_DENIED } from './investigate-ticket';
import { RunSlots } from './slots';

let root: string;
let db: Db;
let projectId: number;
let ticketId: number;
let runs: AgentRun[];
let stopped: string[];
let created: string[];
/** What `git status --porcelain` answers, in order: the second answer is after the agent. */
let statuses: string[];

const runtime = {
  create: (spec: { name: string }) => {
    created.push(spec.name);
    return Promise.resolve();
  },
  start: () => Promise.resolve(),
  stop: (name: string) => {
    stopped.push(name);
    return Promise.resolve();
  },
  remove: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  copyIn: () => Promise.resolve(),
  *exec(_name: string, command: string[]): Generator<string, ExecResult> {
    if (command.includes('rev-parse')) {
      yield 'abc123';
    }
    if (command.includes('--porcelain')) {
      yield statuses.shift() ?? '';
    }
    return { exitCode: 0, stderr: '' };
  },
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: 'The bug is in x.ts', sessionId: 's' });
};

async function runQueued(): Promise<void> {
  const runner = new InvestigationRunner({
    db,
    runtime,
    config: { image: 'i', gitBaseUrl: 'x', credentialsPath: path.join(root, 'credentials.json') },
    slots: new RunSlots(1),
    agent,
  });
  runner.tick();
  await runner.idle();
}

function investigate(): number {
  return createInvestigation(db, {
    projectId,
    title: 'Why is it slow?',
    prompt: 'Find out',
    scope: 'ticket',
    onTicketId: ticketId,
    model: 'sonnet',
    tools: ['Read', 'Bash'],
  }).id;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-investigate-ticket-'));
  await writeFile(path.join(root, 'credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Campaign', body: 'Disable publish' }).id;
  db.update(schema.tickets)
    .set({ branch: 'union/1-campaign', phase: { kind: 'awaiting_approval', step: 'final_review' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  runs = [];
  stopped = [];
  created = [];
  statuses = [' M a.ts', ' M a.ts'];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("it runs in the ticket's own container, read only, about its branch, and stops it after", async () => {
  const id = investigate();
  await runQueued();
  expect(created).toEqual(['union-t1']);
  expect(runs[0]).toMatchObject({ container: 'union-t1', cwd: AGENT_REPO_DIR, model: 'sonnet' });
  expect(runs[0]?.denied).toEqual(TICKET_INVESTIGATION_DENIED);
  expect(runs[0]?.prompt).toContain("on the ticket's branch `union/1-campaign`");
  expect(runs[0]?.prompt).toContain('git diff main...HEAD');
  expect(runs[0]?.prompt).toContain('# Campaign\n\nDisable publish');
  expect(stopped).toEqual(['union-t1']);
  expect(getInvestigation(db, id)).toMatchObject({
    status: 'succeeded',
    result: 'The bug is in x.ts',
  });
});

test('an answer that left the workspace changed says so', async () => {
  statuses = [' M a.ts', ' M a.ts\n?? debug.log'];
  const id = investigate();
  await runQueued();
  expect(getInvestigation(db, id).result).toContain("The ticket's workspace changed");
});

test('never while the ticket runs a step: not asked, not followed up, not run', async () => {
  const id = investigate();
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect(() => investigate()).toThrow('running a step');
  await runQueued();
  expect(runs).toEqual([]);
  expect(getInvestigation(db, id).error).toContain('The ticket started a step');
  finishInvestigation(db, id, { status: 'succeeded', result: 'x' });
  expect(() => askFollowUp(db, id, 'And?')).toThrow('running a step');
});

test('a ticket of another project, or none, is refused', () => {
  const other = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const foreign = createTicket(db, { projectId: other, title: 'x' }).id;
  const base = {
    projectId,
    title: 't',
    prompt: 'p',
    scope: 'ticket' as const,
    model: 'sonnet',
    tools: ['Read'],
  };
  expect(() => createInvestigation(db, { ...base, onTicketId: foreign })).toThrow('Pick a ticket');
  expect(() => createInvestigation(db, base)).toThrow('Pick a ticket');
});

test('a ticket written from it depends on the ticket investigated, unless that one was cancelled', () => {
  const id = investigate();
  finishInvestigation(db, id, { status: 'succeeded', result: 'x' });
  const draft = { title: 'Guard publish', body: 'Fix it' };
  requestTicket(db, id, '');
  claimTicketDraft(db);
  finishTicketDraft(db, id, { draft });
  const written = getInvestigation(db, id).ticketId ?? 0;
  expect(getTicket(db, written).parentTicketId).toBe(ticketId);

  db.update(schema.tickets)
    .set({ phase: { kind: 'cancelled' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  requestTicket(db, id, '');
  claimTicketDraft(db);
  finishTicketDraft(db, id, { draft });
  expect(getTicket(db, getInvestigation(db, id).ticketId ?? 0).parentTicketId).toBeNull();
});
