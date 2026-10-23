import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentOutcome, AgentRun } from './agent';
import { implementLoop, type Workspace } from './implement-loop';
import { agentServicesHint } from './implement-prompts';

let root: string;
let db: Db;
let runs: AgentRun[];
let e2eRuns: number;

/** Checks pass; the e2e command fails on its first run only; compose and the proxy just work. */
const runtime = {
  networkExists: () => Promise.resolve(true),
  projectNetworks: () => Promise.resolve([]),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    if (spec.command.includes('config')) {
      yield JSON.stringify({
        services: { web: { image: 'node:22', networks: { default: null } } },
      });
    }
    return { exitCode: 0, stderr: '' };
  },
  async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    if (command.join(' ').includes('npx playwright test')) {
      e2eRuns += 1;
      yield e2eRuns === 1 ? '1 failed: search › shows results' : '4 passed';
      return { exitCode: e2eRuns === 1 ? 1 : 0, stderr: '' };
    }
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const ok = (n: number): AgentOutcome => ({
  kind: 'ok',
  text: `report ${n}`,
  sessionId: `session-${n}`,
});

function workspace(): Workspace {
  const project = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      config: {
        baseBranch: 'main',
        gateCommand: 'bun test',
        preview: {
          composeFile: 'compose.yaml',
          services: [{ name: 'web', port: 3000, prefix: '' }],
          env: {},
          e2eCommand: 'npx playwright test',
        },
      },
    })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 'Add search' });
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  return {
    deps: {
      db,
      runtime,
      config: { image: 'i', gitBaseUrl: 'x', credentialsPath: 'c' },
      github: () => null,
      agent: (_runtime, run) => {
        runs.push(run);
        return Promise.resolve(ok(runs.length));
      },
    },
    context: {
      ticket,
      step: 'implement',
      revision: null,
      resumeSessionId: null,
      log: () => {
        // events are not checked here
      },
      signal: new AbortController().signal,
      resume: null,
    },
    project,
    container: 'union-t1',
  };
}

const outerRoot = process.env.UNION_ATTACHMENTS_DIR;

/** Back to the test run's temporary folder (`scripts/test-preload.ts`), never the live default. */
function restoreAttachmentsRoot(): void {
  if (outerRoot === undefined) {
    delete process.env.UNION_ATTACHMENTS_DIR;
  } else {
    process.env.UNION_ATTACHMENTS_DIR = outerRoot;
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-implement-e2e-'));
  process.env.UNION_ATTACHMENTS_DIR = root;
  db = createDb(':memory:');
  migrateDb(db);
  runs = [];
  e2eRuns = 0;
});

afterEach(async () => {
  restoreAttachmentsRoot();
  delete process.env.UNION_PREVIEW_PROXY;
  await rm(root, { recursive: true, force: true });
});

test('the implementation never runs the e2e tests on its own, even with an e2e command', async () => {
  const loop = await implementLoop(workspace());
  expect(loop).toMatchObject({ iterations: 1, gate: { green: true } });
  expect(e2eRuns).toBe(0);
  expect(runs[0]?.prompt).not.toContain('A preview of your work is running');
});

test('the agent is told where the preview answers only while it runs', async () => {
  const space = workspace();
  const urls = [{ service: 'web', url: 'http://t1.union.localhost:8080' }];
  updatePreview(db, { ticketId: space.context.ticket.id }, { status: 'running', urls });
  await implementLoop(space);
  expect(runs[0]?.prompt).toContain(
    "same addresses as in the user's browser: web at http://t1.union.localhost:8080 (UNION_URL_WEB).",
  );
  expect(runs[0]?.prompt).toContain('BASE_URL is http://web:3000');
  expect(runs[0]?.prompt).toContain('run only the ones your work touches');
});

test('the implementer is told which services run for it, where, and which variables it has', () => {
  const setup = {
    services: ['db', 'redis'],
    forwards: [{ service: 'db', port: 5432, targetPort: 5432 }],
    skipped: ['localhost:6379 (redis): EADDRINUSE'],
    variables: ['DATABASE_URL'],
    ensure: () => Promise.resolve(),
  };
  const hint = agentServicesHint(setup);
  expect(hint).toContain('run for you: db, redis.');
  expect(hint).toContain('db on localhost:5432 (db:5432)');
  expect(hint).toContain('Not reachable on localhost: localhost:6379 (redis): EADDRINUSE');
  expect(hint).toContain('in your environment: DATABASE_URL');
  expect(agentServicesHint({ ...setup, forwards: [], skipped: [], variables: [] })).toContain(
    "reachable by their names. Use them for the tests that need them; their data is kept between your runs. No project variable is set in your environment: the repository's own env files apply.",
  );
  expect(agentServicesHint(null)).toBe('');
});

test('the forwarder is brought back before every check, and the prompt names the ports', async () => {
  const space = workspace();
  let ensured = 0;
  const services = {
    services: ['db'],
    forwards: [{ service: 'db', port: 5432, targetPort: 5432 }],
    skipped: [],
    variables: [],
    ensure: () => {
      ensured += 1;
      return Promise.resolve();
    },
  };
  await implementLoop({ ...space, deps: { ...space.deps, services } });
  expect(ensured).toBe(1);
  expect(runs[0]?.prompt).toContain('db on localhost:5432 (db:5432)');
});
