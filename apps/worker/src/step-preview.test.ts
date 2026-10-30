import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
} from '@union/core';

import { startStepPreview } from './step-preview';

const INSTALL = 'pnpm install';

let db: Db;
let root: string;
let credentialsPath: string;
let installExit: number;
/** What the preview row said each time the install command ran: undefined before any start. */
let statusAtInstall: (string | undefined)[];

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  root = await mkdtemp(path.join(tmpdir(), 'union-step-preview-test-'));
  credentialsPath = path.join(root, 'credentials.json');
  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'a' } }));
  installExit = 0;
  statusAtInstall = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A project whose preview exposes nothing: a start ends right away, with that as its reason. */
function ticketWith(installCommand?: string): number {
  const project = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      config: {
        baseBranch: 'main',
        ...(installCommand ? { installCommand } : {}),
        preview: { composeFile: 'compose.yaml', env: {}, startForImplementation: true },
      },
    })
    .returning()
    .get();
  return createTicket(db, { projectId: project.id, title: 't' }).id;
}

/** A container already set up, its clone included: only the install command can fail. */
function runtimeFor(ticketId: number): ContainerRuntime {
  return {
    create: () => Promise.resolve(),
    isRunning: () => Promise.resolve(true),
    writeFile: () => Promise.resolve(),
    *exec(_name: string, command: string[]): Generator<string, ExecResult> {
      yield* [];
      if (command.join(' ').includes(INSTALL)) {
        statusAtInstall.push(getPreview(db, { ticketId })?.status);
        return { exitCode: installExit, stderr: 'no lockfile' };
      }
      return { exitCode: 0, stderr: '' };
    },
    *runHelper(): Generator<string, ExecResult> {
      yield* [];
      return { exitCode: 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
}

function start(ticketId: number): Promise<void> {
  const config = { image: 'i', gitBaseUrl: 'x', credentialsPath };
  return startStepPreview({ db, runtime: runtimeFor(ticketId), config }, ticketId);
}

test('the install command runs before the preview starts', async () => {
  const ticketId = ticketWith(INSTALL);
  await start(ticketId);
  expect(statusAtInstall).toEqual([undefined]);
  expect(getPreview(db, { ticketId })?.error).toContain('expose no service');
});

test('a failed install keeps its reason and the preview does not start', async () => {
  const ticketId = ticketWith(INSTALL);
  installExit = 1;
  await start(ticketId);
  const preview = getPreview(db, { ticketId });
  expect(preview?.status).toBe('failed');
  expect(preview?.error).toContain(`Install command \`${INSTALL}\` failed`);
  expect(preview?.error).toContain('no lockfile');
});

test('without an install command the preview still starts', async () => {
  const ticketId = ticketWith();
  await start(ticketId);
  expect(statusAtInstall).toEqual([]);
  expect(getPreview(db, { ticketId })?.error).toContain('expose no service');
});

test('a preview that runs already needs no install', async () => {
  const ticketId = ticketWith(INSTALL);
  updatePreview(db, { ticketId }, { status: 'running' });
  await start(ticketId);
  expect(statusAtInstall).toEqual([]);
  expect(getPreview(db, { ticketId })?.status).toBe('running');
});
