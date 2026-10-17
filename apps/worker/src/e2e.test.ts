import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  getPreview,
  listAttachments,
  migrateDb,
  schema,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecOptions,
  type ExecResult,
  type HelperSpec,
  type PreviewConfig,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runE2e, runRequestedE2e } from './e2e';
import { PreviewManager } from './preview/manager';

const PREVIEW: PreviewConfig = {
  composeFile: 'compose.yaml',
  services: [{ name: 'web', port: 3000, prefix: '' }],
  env: {},
  e2eCommand: 'npx playwright test',
};
const RESOLVED = { services: { web: { image: 'node:22', networks: { default: null } } } };

let root: string;
let db: Db;
let ticketId: number;
let execs: { command: string; env?: Record<string, string> }[];
let testExit: number;
let screenshots: string[];
let resolved: unknown;

let stopped: string[];
/** Holds the test command until released: a run still in progress. */
let held: Promise<unknown> | null;

/** Compose succeeds; in the agent's container the test command exits with `testExit`. */
const runtime = {
  create: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  start: () => Promise.resolve(),
  stop: (name: string) => {
    stopped.push(name);
    return Promise.resolve();
  },
  writeFile: () => Promise.resolve(),
  networkExists: () => Promise.resolve(true),
  projectNetworks: () => Promise.resolve(['union-t1_default']),
  connectNetwork: () => Promise.resolve(),
  disconnectNetwork: () => Promise.resolve(),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    if (spec.command.includes('config')) {
      yield JSON.stringify(resolved);
    }
    return { exitCode: 0, stderr: '' };
  },
  async *exec(
    _name: string,
    command: string[],
    options: ExecOptions = {},
  ): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    const line = command.join(' ');
    execs.push({ command: line, env: options.env });
    if (line.includes('find test-results')) {
      yield* screenshots;
      return { exitCode: 0, stderr: '' };
    }
    if (line.includes('npx playwright test')) {
      await held;
      yield testExit === 0 ? '3 passed' : '1 failed: checkout › pays';
      return { exitCode: testExit, stderr: '' };
    }
    return { exitCode: 0, stderr: '' };
  },
  async copyOut(_name: string, _from: string, to: string): Promise<void> {
    await writeFile(to, new Uint8Array([137, 80, 78, 71]));
  },
} as unknown as ContainerRuntime;

function e2e(preview: PreviewConfig = PREVIEW): ReturnType<typeof runE2e> {
  return runE2e({
    db,
    runtime,
    ticketId,
    container: 'union-t1',
    preview,
    previewOverrides: {
      readyTimeoutMs: 50,
      readyIntervalMs: 5,
      fetchFn: () => Promise.resolve(new Response('ok')),
    },
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-e2e-test-'));
  process.env.UNION_ATTACHMENTS_DIR = root;
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main', preview: PREVIEW } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Checkout', body: '' }).id;
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  execs = [];
  testExit = 0;
  screenshots = [];
  resolved = RESOLVED;
  stopped = [];
  held = null;
  await writeFile(path.join(root, 'credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
});

afterEach(async () => {
  delete process.env.UNION_ATTACHMENTS_DIR;
  await rm(root, { recursive: true, force: true });
});

test('without an e2e command there is no gate', async () => {
  expect(await e2e({ ...PREVIEW, e2eCommand: undefined })).toBeNull();
  expect(execs).toEqual([]);
});

test('the tests run against the preview, from inside it, after the browser is installed', async () => {
  const result = await e2e();
  expect(result).toMatchObject({ status: 'green', exitCode: 0, tail: '3 passed', screenshots: 0 });
  expect(execs[0]?.command).toContain('playwright install chromium');
  expect(execs[1]).toEqual({
    command: 'sh -lc npx playwright test 2>&1',
    env: { BASE_URL: 'http://web:3000', PREVIEW_URL: 'http://web:3000' },
  });
});

test('a red run keeps its failure screenshots as ticket files; a green one clears them', async () => {
  testExit = 1;
  screenshots = ['test-results/checkout-pays/test-failed-1.png'];
  const red = await e2e();
  expect(red).toMatchObject({ status: 'red', exitCode: 1, screenshots: 1 });
  expect(listAttachments(db, ticketId).map((file) => file.name)).toEqual(['e2e-checkout-pays.png']);
  expect(await readdir(path.join(root, `t${ticketId}`))).toEqual(['e2e-checkout-pays.png']);

  testExit = 0;
  expect((await e2e())?.status).toBe('green');
  expect(listAttachments(db, ticketId)).toEqual([]);
});

test('a preview that cannot run now skips the tests; one the code broke counts as red', async () => {
  for (const id of [101, 102, 103]) {
    const other = createTicket(db, { projectId: 1, title: `t${id}`, body: '' });
    updatePreview(db, { ticketId: other.id }, { status: 'running' });
  }
  expect(await e2e()).toMatchObject({ status: 'skipped' });

  db.update(schema.previews).set({ status: 'stopped' }).run();
  resolved = { services: { web: { image: 'x', privileged: true } } };
  const result = await e2e();
  expect(result).toMatchObject({ status: 'red' });
  expect(result?.status === 'red' ? result.tail : '').toContain('The preview did not start');
});

function provision(): { image: string; gitBaseUrl: string; credentialsPath: string } {
  return { image: 'i', gitBaseUrl: 'x', credentialsPath: path.join(root, 'credentials.json') };
}

test('a run the user asks for is kept on the preview, and the container stops after', async () => {
  testExit = 1;
  await runRequestedE2e(
    {
      db,
      runtime,
      config: provision(),
      settings: { image: 'i', publicPort: 8080, proxyUrl: 'http://proxy', maxRunning: 3 },
      fetchFn: () => Promise.resolve(new Response('ok')),
    },
    ticketId,
  );
  expect(getPreview(db, { ticketId })).toMatchObject({
    e2eStatus: 'red',
    e2eExitCode: 1,
    e2eOutput: '1 failed: checkout › pays',
  });
  expect(stopped).toEqual(['union-t1']);
});

test('one e2e run at a time across tickets: a second request says why it did not run', async () => {
  const gate = Promise.withResolvers<null>();
  held = gate.promise;
  const manager = new PreviewManager({
    db,
    runtime,
    config: provision(),
    settings: { image: 'i', publicPort: 8080, proxyUrl: 'http://proxy', maxRunning: 3 },
    fetchFn: () => Promise.resolve(new Response('ok')),
  });
  const other = createTicket(db, { projectId: 1, title: 'Search', body: '' }).id;
  manager.run({ ticketId }, 'e2e');
  manager.run({ ticketId: other }, 'e2e');
  expect(getPreview(db, { ticketId: other })).toMatchObject({ e2eStatus: 'skipped' });
  expect(getPreview(db, { ticketId: other })?.e2eOutput).toContain('one run at a time');
  gate.resolve(null);
  await manager.idle();
  expect(getPreview(db, { ticketId })?.e2eStatus).toBe('green');
});
