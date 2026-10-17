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
  type PreviewConfig,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewSettings } from './compose';
import { startPreview, type PreviewDeps } from './run';

const PREVIEW: PreviewConfig = { composeFile: 'compose.yaml', service: 'web', port: 80, env: {} };

let db: Db;
let projectId: number;

/** Compose resolves a one-service file and starts it; the service answers at once. */
const runtime = {
  networkExists: () => Promise.resolve(true),
  projectNetworks: () => Promise.resolve([]),
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    await Promise.resolve();
    if (spec.command.join(' ').includes(' config ')) {
      yield JSON.stringify({ services: { web: { image: 'nginx', networks: { default: null } } } });
    }
    return { exitCode: 0, stderr: '' };
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

function ticketWithWorkspace(project: number, title: string): number {
  const { id } = createTicket(db, { projectId: project, title, body: '' });
  db.update(schema.tickets)
    .set({ workspaceVolume: `union-t${id}-ws` })
    .where(eq(schema.tickets.id, id))
    .run();
  return id;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main', preview: PREVIEW } })
    .returning()
    .get().id;
});

test("past Union's running cap, a start is refused", async () => {
  for (const title of ['a', 'b', 'c']) {
    updatePreview(
      db,
      { ticketId: createTicket(db, { projectId, title, body: '' }).id },
      { status: 'running' },
    );
  }
  const ticketId = ticketWithWorkspace(projectId, 'd');
  await startPreview(deps(), { ticketId });
  expect(getPreview(db, { ticketId })?.error).toContain('3 previews are running already');
});

test("the project's own cap counts only its previews", async () => {
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', preview: { ...PREVIEW, maxRunning: 1 } } })
    .where(eq(schema.projects.id, projectId))
    .run();
  const elsewhere = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'other', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  updatePreview(
    db,
    { ticketId: createTicket(db, { projectId: elsewhere, title: 'x', body: '' }).id },
    {
      status: 'running',
    },
  );
  const first = ticketWithWorkspace(projectId, 'first');
  await startPreview(deps(), { ticketId: first });
  expect(getPreview(db, { ticketId: first })?.status).toBe('running');
  const second = ticketWithWorkspace(projectId, 'second');
  await startPreview(deps(), { ticketId: second });
  expect(getPreview(db, { ticketId: second })?.error).toContain(
    "1 of the project's previews are running already",
  );
});
