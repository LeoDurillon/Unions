import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  getContainerRun,
  migrateDb,
  queueContainerRun,
  updatePreview,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecOptions,
  type ExecResult,
  type HelperSpec,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { ContainerRunner } from './container-run';

type Exec = { command: string[]; options: ExecOptions };

let root: string;
let db: Db;
let ticketId: number;
let execs: Exec[];
let helpers: string[];
const RESOLVED = {
  services: {
    web: { image: 'node' },
    db: { image: 'postgres', ports: [{ target: 5432, published: '5432', protocol: 'tcp' }] },
  },
};
let stops: number;
/** What the user's command does: its lines and exit code, or it waits until it is stopped. */
let behaviour: { lines: string[]; exitCode: number } | 'hang';

function hang(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      reject(new Error('aborted'));
    });
  });
}

const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => {
    stops += 1;
    return Promise.resolve();
  },
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  copyIn: () => Promise.resolve(),
  projectNetworks: () => Promise.resolve([]),
  connectNetwork: () => Promise.resolve(),
  async *exec(_name: string, command: string[], options: ExecOptions = {}) {
    execs.push({ command, options });
    if (command[0] !== 'setsid') {
      return { exitCode: 0, stderr: '' } satisfies ExecResult;
    }
    yield 'started';
    if (behaviour === 'hang') {
      await hang(options.signal);
    }
    const { lines, exitCode } = behaviour === 'hang' ? { lines: [], exitCode: 1 } : behaviour;
    yield* lines;
    return { exitCode, stderr: '' } satisfies ExecResult;
  },
  *runHelper(spec: HelperSpec): Generator<string, ExecResult> {
    const args = spec.command.join(' ');
    helpers.push(args);
    if (args.includes(' config ')) {
      yield JSON.stringify(RESOLVED);
    }
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function runner(): ContainerRunner {
  return new ContainerRunner({
    db,
    runtime,
    config: {
      image: 'i',
      gitBaseUrl: `file://${root}`,
      credentialsPath: path.join(root, 'c.json'),
    },
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-container-run-'));
  await writeFile(
    path.join(root, 'c.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      config: {
        baseBranch: 'main',
        preview: {
          composeFile: 'compose.yml',
          env: {},
          services: [{ name: 'web', port: 3000, prefix: '' }],
        },
      },
    })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'T' }).id;
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  execs = [];
  helpers = [];
  stops = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('a command runs in the checkout, in its own process group, then the container stops', async () => {
  behaviour = { lines: ['\u001B[32mok\u001B[0m 3 tests'], exitCode: 0 };
  const run = queueContainerRun(db, { owner: { ticketId }, command: 'npm test' });
  const workers = runner();
  workers.tick();
  await workers.idle();
  expect(getContainerRun(db, run.id)).toMatchObject({
    status: 'succeeded',
    exitCode: 0,
    output: 'started\nok 3 tests',
  });
  const command = execs.find((exec) => exec.command[0] === 'setsid');
  expect(command?.options).toMatchObject({
    cwd: '/workspace/repo',
    env: { UNION_COMMAND: 'npm test', UNION_PID_FILE: `/tmp/union-run-${run.id}.pid` },
  });
  // No preview runs: no address is given.
  expect(command?.options.env?.PREVIEW_URL).toBeUndefined();
  expect(stops).toBe(1);
});

test("a failing command keeps its exit code; with the preview running, it gets the preview's address", async () => {
  updatePreview(db, { ticketId }, { status: 'running' });
  behaviour = { lines: ['boom'], exitCode: 2 };
  const run = queueContainerRun(db, { owner: { ticketId }, command: 'npm run import' });
  const workers = runner();
  workers.tick();
  await workers.idle();
  expect(getContainerRun(db, run.id)).toMatchObject({ status: 'failed', exitCode: 2, error: null });
  const command = execs.find((exec) => exec.command[0] === 'setsid');
  expect(command?.options.env).toMatchObject({ PREVIEW_URL: 'http://web:3000' });
});

test('a cancel stops the command and kills its process group', async () => {
  behaviour = 'hang';
  const run = queueContainerRun(db, { owner: { ticketId }, command: 'sleep 100' });
  const workers = runner();
  workers.tick();
  await Bun.sleep(10);
  workers.cancel(run.id);
  await workers.idle();
  expect(getContainerRun(db, run.id)).toMatchObject({ status: 'cancelled', output: 'started' });
  const kill = execs.find((exec) => exec.command.join(' ').includes('kill -TERM'));
  expect(kill?.options.env).toEqual({ UNION_PID_FILE: `/tmp/union-run-${run.id}.pid` });
});

test('a timeout fails the run with the reason', async () => {
  behaviour = 'hang';
  const run = queueContainerRun(db, { owner: { ticketId }, command: 'sleep 100', timeoutSec: 1 });
  const workers = runner();
  workers.tick();
  await workers.idle();
  expect(getContainerRun(db, run.id)).toMatchObject({
    status: 'failed',
    error: 'Stopped after 1 s (the timeout)',
  });
});

test("with agent services, a command gets the agent's environment: services, localhost, variables", async () => {
  const project = db.select().from(schema.projects).get();
  const preview = project?.config.preview;
  if (!project || !preview) {
    throw new Error('no project');
  }
  const agent = {
    ...preview,
    env: { DATABASE_URL: 'postgres://db/app', S3_URL: 'http://s3' },
    agentServices: ['db'],
    agentVariables: { mode: 'chosen' as const, names: ['S3_URL'] },
  };
  db.update(schema.projects)
    .set({ config: { ...project.config, preview: agent } })
    .where(eq(schema.projects.id, project.id))
    .run();
  behaviour = { lines: ['ok'], exitCode: 0 };
  queueContainerRun(db, { owner: { ticketId }, command: 'pnpm test:e2e' });
  const workers = runner();
  workers.tick();
  await workers.idle();
  expect(helpers.some((args) => args.endsWith('up -d db'))).toBe(true);
  const forwarder = execs.find(
    (exec) => exec.options.env?.UNION_FORWARD_BASE === '/tmp/union-forward',
  );
  expect(JSON.parse(forwarder?.options.env?.UNION_FORWARDS ?? '[]')).toEqual([
    { service: 'db', port: 5432, targetPort: 5432 },
  ]);
  const command = execs.find((exec) => exec.command[0] === 'setsid');
  expect(command?.options.env).toMatchObject({
    S3_URL: 'http://s3',
    UNION_COMMAND: 'pnpm test:e2e',
  });
  expect(command?.options.env?.DATABASE_URL).toBeUndefined();
  // After the run the services stop with the container.
  expect(helpers.at(-1)).toContain('stop');
  expect(stops).toBe(1);
});
