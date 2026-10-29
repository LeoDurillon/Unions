import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getPreview,
  migrateDb,
  recordDataFolders,
  schema,
  type ComposeJson,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type HelperSpec,
} from '@union/core';

import { previewSettings } from './compose';
import { emptyDataFolders, findDataFolders, mountedFolders } from './data-folders';
import type { PreviewDeps, Target } from './target';

/** How the file a preview runs names the workspace volume (`PREVIEW_WORKSPACE_KEY` in core). */
const WORKSPACE_KEY = 'union_workspace';

const mounts = (subpaths: string[]): ComposeJson => ({
  services: {
    db: {
      volumes: subpaths.map((subpath) => ({
        type: 'volume',
        source: WORKSPACE_KEY,
        target: `/mnt/${subpath}`,
        volume: { subpath },
      })),
    },
  },
});

let db: Db;
let ticketId: number;
let helpers: HelperSpec[];
/** What the helper prints, and how it exits. */
let printed: string[];
let exitCode: number;

const runtime = {
  async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    helpers.push(spec);
    await Promise.resolve();
    yield* printed;
    return { exitCode, stderr: '' };
  },
} as unknown as ContainerRuntime;

function deps(): PreviewDeps {
  return { db, runtime, settings: previewSettings({}) };
}

function target(): Target {
  return {
    owner: { ticketId },
    projectId: 1,
    project: 'union-t1',
    config: { composeFile: 'compose.yaml', env: {} },
    workspaceVolume: 'union-t1-ws',
    exposed: [],
    urls: [],
    plain: {},
    secrets: {},
  };
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
  helpers = [];
  printed = [];
  exitCode = 0;
});

test('the folders a file mounts are relative to the repository; the repository itself is not one', () => {
  expect(mountedFolders(mounts(['repo', 'repo/data', 'repo/var/pg', 'repo/data']))).toEqual([
    'data',
    'var/pg',
  ]);
});

test('the folders git ignores whole are recorded; anything else the helper prints is not', async () => {
  printed = ['data', 'fatal: not a folder we asked about'];
  await findDataFolders(deps(), target(), mounts(['repo/data', 'repo/src']));
  expect(helpers[0]?.command.slice(4)).toEqual(['data', 'src']);
  expect(helpers[0]?.mounts).toEqual([{ source: 'union-t1-ws', target: '/workspace' }]);
  expect(getPreview(db, { ticketId })?.dataFolders).toEqual(['data']);

  // A failed check keeps what the last start found.
  exitCode = 1;
  printed = [];
  await findDataFolders(deps(), target(), mounts(['repo/data']));
  expect(getPreview(db, { ticketId })?.dataFolders).toEqual(['data']);
});

test('only the chosen folders the last start found are emptied', async () => {
  recordDataFolders(db, { ticketId }, ['data', 'cache']);
  expect(await emptyDataFolders(deps(), target(), ['src', 'data'])).toEqual(['data']);
  expect(helpers[0]?.command.slice(4)).toEqual(['data']);

  helpers = [];
  expect(await emptyDataFolders(deps(), target(), ['src'])).toEqual([]);
  expect(helpers).toEqual([]);

  exitCode = 1;
  printed = ['find: permission denied'];
  const failure = await emptyDataFolders(deps(), target(), ['cache']).catch(
    (error: unknown) => error,
  );
  expect(failure instanceof Error ? failure.message : '').toBe(
    'Could not empty cache:\nfind: permission denied',
  );
});
