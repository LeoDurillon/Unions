import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  getTicket,
  latestPrDescription,
  migrateDb,
  queuePrDescription,
  schema,
  startSendingPrDescription,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { FakeGitHubApi } from './github/fake-api';
import { sendPrDescription } from './github/pr-description-send';
import { PrDescriptionRunner } from './pr-description-runner';
import { RunSlots } from './slots';

const REPO = { owner: 'acme', repo: 'shop' };
/** More than the slices any test splits into. */
const MAX_ROUNDS = 3;
const ON_GITHUB = 'Adds search.\n\nA note a reviewer added.\n\nCloses #12';

let root: string;
let db: Db;
let api: FakeGitHubApi;
let ticketId: number;
let runs: AgentRun[];
let reply: string;

/** Every command succeeds silently: the workspace exists, there is no PR template. */
const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  copyIn: () => Promise.resolve(),
  *exec(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
  // No project files: the workspace check finds nothing to do.
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: reply, sessionId: 's' });
};

async function rewrite(): Promise<void> {
  queuePrDescription(db, ticketId);
  const runner = new PrDescriptionRunner({
    db,
    runtime,
    config: {
      image: 'i',
      gitBaseUrl: `file://${root}`,
      credentialsPath: path.join(root, 'credentials.json'),
    },
    slots: new RunSlots(1),
    apiFor: () => api,
    agent,
  });
  // A ticket's rewrites run one at a time: each tick starts the next.
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    runner.tick();
    await runner.idle();
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-pr-description-'));
  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  api = new FakeGitHubApi();
  const pull = await api.createPullRequest(REPO, {
    title: 'Add search',
    body: ON_GITHUB,
    head: '12-add-search',
    base: 'main',
  });
  ticketId = createTicket(db, { projectId, title: 'Add search', body: 'Search the shop' }).id;
  db.update(schema.tickets)
    .set({
      branch: '12-add-search',
      prNumber: pull.number,
      issueNumber: 12,
      sessionId: 'impl-session',
      phase: { kind: 'done' },
    })
    .run();
  runs = [];
  reply = '```markdown\nAdds search, with filters.\n\nA note a reviewer added.\n```';
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("the implementer rewrites GitHub's description, without Union's links, into a draft", async () => {
  await rewrite();
  expect(runs[0]).toMatchObject({
    container: 'union-t1',
    resumeSessionId: 'impl-session',
    model: 'opus',
  });
  expect(runs[0]?.prompt).toContain('git diff main...HEAD');
  expect(runs[0]?.prompt).toContain('A note a reviewer added.');
  expect(runs[0]?.prompt).not.toContain('Closes #12');
  expect(latestPrDescription(db, ticketId)).toMatchObject({
    status: 'ready',
    original: ON_GITHUB,
    text: 'Adds search, with filters.\n\nA note a reviewer added.',
  });
  // Nothing was written to GitHub.
  expect(api.calls).not.toContain('updatePullRequestBody');
});

test("the user's version is written with Union's links, unless GitHub's changed meanwhile", async () => {
  await rewrite();
  const draft = latestPrDescription(db, ticketId);
  if (!draft) {
    throw new Error('no draft');
  }
  const [pull] = api.pulls;
  if (!pull) {
    throw new Error('no pull request');
  }
  pull.body = 'Edited on GitHub';
  startSendingPrDescription(db, draft.id, 'Adds search.');
  await sendPrDescription(db, () => api, draft.id);
  expect(latestPrDescription(db, ticketId)?.status).toBe('conflict');
  expect(pull.body).toBe('Edited on GitHub');

  await rewrite();
  const second = latestPrDescription(db, ticketId);
  if (!second) {
    throw new Error('no draft');
  }
  startSendingPrDescription(db, second.id, 'Adds search, edited.');
  await sendPrDescription(db, () => api, second.id);
  expect(latestPrDescription(db, ticketId)?.status).toBe('sent');
  expect(pull.body).toBe('Adds search, edited.\n\nCloses #12');
});

test('a step started meanwhile fails the rewrite rather than share the workspace', async () => {
  // The web refuses a rewrite during a run; this one was queued just before the step started.
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .run();
  await rewrite();
  expect(runs).toHaveLength(0);
  expect(latestPrDescription(db, ticketId)).toMatchObject({ status: 'failed' });
  expect(getTicket(db, ticketId).phase.kind).toBe('running');
});

const LOWER_BODY =
  'Moves the module.\n\n**Stack**, bottom first: merge from the bottom.\n\n1. **#2 Move** (this pull request)\n2. #1 Search\n\nPart of #12.';

/** Splits the ticket in two: a lower slice with its own pull request, the ticket's on top. */
async function split(): Promise<number> {
  const lower = await api.createPullRequest(REPO, {
    title: 'Move',
    body: LOWER_BODY,
    head: '12-add-search-s1',
    base: 'main',
  });
  const own = getTicket(db, ticketId).prNumber;
  const slices = [
    {
      position: 1,
      title: 'Move',
      branch: '12-add-search-s1',
      tipSha: 'tip1',
      prNumber: lower.number,
    },
    { position: 2, title: 'Search', branch: '12-add-search', tipSha: 'tip2', prNumber: own },
  ];
  for (const slice of slices) {
    db.insert(schema.ticketSlices)
      .values({ ticketId, spec: `Spec of ${slice.title}`, prState: 'open', ...slice })
      .run();
  }
  return lower.number;
}

test("a split ticket's slices are each rewritten about their own change, then sent with the stack", async () => {
  const lower = await split();
  await rewrite();
  expect(runs).toHaveLength(2);
  expect(runs[0]?.prompt).toContain('git diff main...tip1');
  expect(runs[0]?.prompt).toContain('Spec of Move');
  expect(runs[0]?.prompt).toContain('Moves the module.');
  expect(runs[0]?.prompt).not.toContain('Part of #12');
  expect(runs[1]?.prompt).toContain('git diff tip1...tip2');
  const draft = latestPrDescription(db, ticketId, lower);
  if (!draft) {
    throw new Error('no draft');
  }
  startSendingPrDescription(db, draft.id, 'Moves the module, edited.');
  await sendPrDescription(db, () => api, draft.id);
  const pull = api.pulls.find((each) => each.number === lower);
  expect(pull?.body).toBe(
    'Moves the module, edited.\n\n**Stack**, bottom first: merge from the bottom.\n\n1. **#2 Move** (this pull request)\n2. #1 Search\n\nPart of #12.',
  );
});
