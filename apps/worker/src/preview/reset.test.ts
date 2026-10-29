import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getPreview,
  migrateDb,
  schema,
  recordDataFolders,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewSettings } from './compose';
import { resetPreview } from './reset';
import type { PreviewDeps } from './run';

const RESOLVED = {
  services: {
    web: { build: { context: '/workspace/repo' }, networks: { default: null } },
    db: { image: 'postgres:16', networks: { default: null } },
  },
};

let db: Db;
let ticketId: number;
/** The compose calls, without the helper's `docker compose` prefix. */
let composed: string[];
/** The folders the plain helpers' scripts got (`$1`…). */
let scripted: string[][];
let buildExit: number;

/** Compose answers `config` with the resolved file; `build` exits with `buildExit`, the rest 0. */
const runtime = {
  networkExists: () => Promise.resolve(true),
  serviceContainers: () => Promise.resolve(['union-next-proxy-1']),
  projectNetworks: (project: string) => Promise.resolve([`${project}_default`]),
  connectNetwork: () => Promise.resolve(),
  disconnectNetwork: () => Promise.resolve(),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    if (spec.command[0] !== 'docker') {
      scripted.push(spec.command.slice(4));
      return { exitCode: 0, stderr: '' };
    }
    const command = spec.command.slice(4).join(' ');
    composed.push(command);
    if (command.includes(' config ')) {
      yield JSON.stringify(RESOLVED);
    }
    return { exitCode: command.includes(' build ') ? buildExit : 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): PreviewDeps {
  return {
    db,
    runtime,
    settings: previewSettings({}),
    readyTimeoutMs: 50,
    readyIntervalMs: 5,
    fetchFn: () => Promise.resolve(new Response('ok')),
  };
}

function events(type: string): unknown[] {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, type))
    .all()
    .map((row) => row.payload);
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      config: {
        baseBranch: 'main',
        preview: { composeFile: 'compose.yaml', service: 'web', port: 80, env: {} },
      },
    })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  updatePreview(db, { ticketId }, { status: 'failed', error: 'relation "users" is broken' });
  composed = [];
  scripted = [];
  buildExit = 0;
});

test('a reset drops containers, volumes and built images, builds without the cache, then starts', async () => {
  await resetPreview(deps(), { ticketId });
  const steps = composed.filter((command) => !command.includes(' config '));
  expect(steps.slice(0, 3)).toEqual([
    '-p union-t1 down -v --remove-orphans --rmi local',
    '-p union-t1 --project-directory /workspace/repo -f - build --no-cache',
    '-p union-t1 --project-directory /workspace/repo -f - up -d --build --remove-orphans',
  ]);
  expect(getPreview(db, { ticketId })).toMatchObject({ status: 'running', error: null });
  expect(events('preview_reset')).toHaveLength(1);
});

test('a failed build leaves the preview failed, with the reason, and starts nothing', async () => {
  buildExit = 1;
  await resetPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.status).toBe('failed');
  expect(getPreview(db, { ticketId })?.error).toContain('docker compose build failed');
  expect(composed.some((command) => command.includes(' up '))).toBe(false);
});

test('a reset during a step touches nothing: the agent uses its services', async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await resetPreview(deps(), { ticketId });
  expect(composed).toEqual([]);
  expect(getPreview(db, { ticketId })?.status).toBe('failed');
  expect(events('preview_busy')).toHaveLength(1);
});

test('the data folders chosen, among the ones found, are emptied after the take-down', async () => {
  recordDataFolders(db, { ticketId }, ['data']);
  await resetPreview(deps(), { ticketId }, ['data', 'src']);
  expect(scripted).toContainEqual(['data']);
  expect(scripted.flat()).not.toContain('src');
  expect(events('preview_reset')).toEqual([
    {
      message:
        'Preview reset: its containers, volumes and built images were removed, and data emptied',
    },
  ]);
});
