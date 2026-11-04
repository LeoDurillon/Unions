import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getPreview,
  migrateDb,
  schema,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
  type ProjectContainer,
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewSettings } from './compose';
import { failStoppedPreview, HealthWatcher } from './health';
import type { PreviewDeps } from './run';

const URLS = [
  { service: 'api', url: 'http://api-t1.union.localhost:8080' },
  { service: 'web', url: 'http://t1.union.localhost:8080' },
];

let db: Db;
let ticketId: number;
let containers: ProjectContainer[];
let composed: string[];

const runtime = {
  projectContainers: () => Promise.resolve(containers),
  networkExists: () => Promise.resolve(true),
  serviceContainers: () => Promise.resolve(['union-next-proxy-1']),
  projectNetworks: (project: string) => Promise.resolve([`${project}_default`]),
  disconnectNetwork: () => Promise.resolve(),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    const command = spec.command.slice(4).join(' ');
    composed.push(command);
    if (command.includes(' logs ')) {
      yield 'api-1  | Error: cannot reach db';
    }
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): PreviewDeps {
  return { db, runtime, settings: previewSettings({}) };
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
  updatePreview(db, { ticketId }, { status: 'running', urls: URLS });
  containers = [
    { service: 'api', running: false, exitCode: 1 },
    { service: 'web', running: true, exitCode: null },
    { service: 'db', running: true, exitCode: null },
  ];
  composed = [];
});

test('a running preview whose exposed service exited fails, keeps its output, and takes the rest down without its volumes', async () => {
  await failStoppedPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })).toMatchObject({
    status: 'failed',
    error: 'The preview stopped: "api" exited (code 1). Start it again; its data is kept.',
    logTail: 'api-1  | Error: cannot reach db',
  });
  expect(composed.at(-1)).toBe('-p union-t1 down --remove-orphans');
  const events = db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
  expect(events).toContain('preview_services_stopped');
});

test("during a step the agent's services are left running", async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await failStoppedPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.status).toBe('failed');
  expect(composed.some((command) => command.includes(' down'))).toBe(false);
});

test('a preview whose services are up, or one not running, is left alone', async () => {
  containers = containers.map((container) => ({ ...container, running: true }));
  await failStoppedPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.status).toBe('running');
  containers[0] = { service: 'api', running: false, exitCode: 137 };
  updatePreview(db, { ticketId }, { status: 'starting' });
  await failStoppedPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.status).toBe('starting');
});

test('the watcher reports only the previews with a stopped exposed service', async () => {
  const reported: WorkspaceOwner[] = [];
  const watcher = new HealthWatcher({
    db,
    runtime,
    onStopped: (owner) => {
      reported.push(owner);
    },
  });
  await watcher.check();
  expect(reported).toEqual([{ ticketId }]);
  reported.length = 0;
  for (const container of containers) {
    container.running = true;
  }
  await watcher.check();
  expect(reported).toEqual([]);
});
