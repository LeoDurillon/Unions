// Tests for what the user asks of the shared services: a stop frees their networks first, and waits
// for the project's previews.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getSharedStack,
  migrateDb,
  schema,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';

import { previewSettings } from './compose';
import { restartShared, stopShared } from './shared-actions';

let db: Db;
let projectId: number;
/** What happened, in order: Docker calls and compose commands. */
let done: string[];

const runtime = {
  networkContainers: (network: string) =>
    Promise.resolve(
      network.endsWith('-shared_default') ? ['union-p1-shared-db-1', 'union-t4'] : [],
    ),
  containerNetworks: () => Promise.resolve(['union-p1-shared_default', 'union-t9_default']),
  projectNetworks: () => Promise.resolve(['union-p1-shared_default']),
  projectContainers: () => Promise.resolve([]),
  disconnectNetwork: (network: string, container: string) => {
    done.push(`leave ${network} ${container}`);
    return Promise.resolve();
  },
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    done.push(spec.command.slice(4).join(' '));
    await Promise.resolve();
    yield '';
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): {
  db: Db;
  runtime: ContainerRuntime;
  settings: ReturnType<typeof previewSettings>;
} {
  return { db, runtime, settings: previewSettings({}) };
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  done = [];
});

test('a stop takes the tickets and the previews off their networks, then takes them down', async () => {
  await stopShared(deps(), projectId);
  expect(done).toEqual([
    'leave union-p1-shared_default union-t4',
    'leave union-t9_default union-p1-shared-db-1',
    '-p union-p1-shared down --remove-orphans',
  ]);
  expect(getSharedStack(db, projectId)?.status).toBe('stopped');
});

test("a stop waits for the project's previews: it is refused, and says why", async () => {
  const ticketId = createTicket(db, { projectId, title: 'x', body: '' }).id;
  updatePreview(db, { ticketId }, { status: 'running' });
  await stopShared(deps(), projectId);
  expect(done).toEqual([]);
  expect(getSharedStack(db, projectId)?.error).toBe(
    'A preview of the project uses them: stop it first',
  );
});

test('a restart keeps their networks: one compose call', async () => {
  await restartShared(deps(), projectId);
  expect(done).toEqual(['-p union-p1-shared restart']);
});
