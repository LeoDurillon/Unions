import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  decideRefusal,
  latestRefusal,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';

import { applyDecision, commitLeftovers, LEFTOVER_MESSAGE, proposedMessage } from './leftovers';
import { REPO_DIR } from './provision';
import { pauseOnRefusal, pendingRefusal, resumeRefusal } from './refused-commit';

let dir: string;

/** Runs the container's commands on the host, in a temporary repository standing for the workspace. */
const runtime = {
  async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
    const args = command.map((arg) => (arg === REPO_DIR ? dir : arg));
    const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    yield* stdout
      .split('\n')
      .filter((line, index, lines) => index < lines.length - 1 || line !== '');
    return { exitCode, stderr };
  },
} as unknown as ContainerRuntime;

async function git(...args: string[]): Promise<string> {
  const child = Bun.spawn(['git', '-C', dir, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(child.stdout).text();
  await child.exited;
  return out.trim();
}

/** A pre-commit hook that refuses any staged file containing `TODO`, like a strict linter. */
async function strictHook(): Promise<void> {
  const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(
    hook,
    '#!/bin/sh\nif git diff --cached | grep -q TODO; then echo "lint: 1 warning (TODO left)"; exit 1; fi\n',
  );
  await chmod(hook, 0o755);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'union-leftovers-'));
  await git('init', '--quiet');
  await git('config', 'user.name', 't');
  await git('config', 'user.email', 't@t');
  await writeFile(path.join(dir, 'page.ts'), 'export const page = 1;\n');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'init');
  await strictHook();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('a clean tree has nothing to commit, and accepted leftovers are committed', async () => {
  expect(await commitLeftovers(runtime, 'c')).toEqual({ kind: 'clean' });
  await writeFile(path.join(dir, 'page.ts'), 'export const page = 2;\n');
  expect(await commitLeftovers(runtime, 'c')).toEqual({ kind: 'committed' });
  expect(await git('log', '-1', '--format=%s')).toBe(LEFTOVER_MESSAGE);
});

test('a refusal keeps the changes staged and describes them', async () => {
  await writeFile(path.join(dir, 'page.ts'), 'export const page = 2; // TODO\n');
  await writeFile(path.join(dir, 'new.ts'), 'export {};\n');
  const result = await commitLeftovers(runtime, 'c');
  if (result.kind !== 'refused') {
    throw new Error(`expected a refusal, got ${result.kind}`);
  }
  expect(result.hookOutput).toContain('lint: 1 warning');
  expect(result.leftovers.files).toEqual(['new.ts', 'page.ts']);
  expect(result.leftovers.diff).toContain('+export const page = 2; // TODO');
  expect(await git('log', '-1', '--format=%s')).toBe('init');
  expect(await git('diff', '--cached', '--name-only')).toBe('new.ts\npage.ts');
});

test('the decision applies to the exact diff: commit without hooks, set aside, or ask again', async () => {
  await writeFile(path.join(dir, 'page.ts'), 'export const page = 2; // TODO\n');
  const result = await commitLeftovers(runtime, 'c');
  if (result.kind !== 'refused') {
    throw new Error('expected a refusal');
  }
  const { diffHash } = result.leftovers;

  await writeFile(path.join(dir, 'page.ts'), 'export const page = 3; // TODO\n');
  const changed = await applyDecision(runtime, 'c', {
    resolution: 'commit',
    message: 'm',
    diffHash,
  });
  expect(changed.kind).toBe('changed');
  expect(await git('log', '-1', '--format=%s')).toBe('init');

  await writeFile(path.join(dir, 'page.ts'), 'export const page = 2; // TODO\n');
  const message = '✨ use the lot shape';
  expect(await applyDecision(runtime, 'c', { resolution: 'commit', message, diffHash })).toEqual({
    kind: 'applied',
  });
  expect(await git('log', '-1', '--format=%s')).toBe(message);
  expect(await git('log', '-1', '--format=%b')).toContain('--no-verify');
  expect(await git('status', '--porcelain')).toBe('');
});

test('changes set aside go to a stash, out of the branch', async () => {
  await writeFile(path.join(dir, 'new.ts'), 'export {}; // TODO\n');
  const result = await commitLeftovers(runtime, 'c');
  if (result.kind !== 'refused') {
    throw new Error('expected a refusal');
  }
  const { diffHash } = result.leftovers;
  await applyDecision(runtime, 'c', { resolution: 'discard', message: '', diffHash });
  expect(await git('status', '--porcelain')).toBe('');
  expect(await git('log', '-1', '--format=%s')).toBe('init');
  expect(await git('stash', 'list')).toContain('left out after a hook refused');
});

test('the commit message is the one the agent asked for at the end of its report', () => {
  expect(proposedMessage('Done.\n\nRefused commit: `🐛 highlight every space of a lot`\n')).toBe(
    '🐛 highlight every space of a lot',
  );
  expect(proposedMessage('Done, nothing refused.')).toBe(LEFTOVER_MESSAGE);
});

test('a paused run resumes with the decision, and asks again when the changes moved', async () => {
  const db: Db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
  await writeFile(path.join(dir, 'page.ts'), 'export const page = 2; // TODO\n');
  const refused = await commitLeftovers(runtime, 'c');
  if (refused.kind !== 'refused') {
    throw new Error('expected a refusal');
  }
  const paused = pauseOnRefusal(db, {
    ticketId,
    step: 'implement',
    refused,
    report: 'Report.\n\nRefused commit: fix the page',
    sessionId: 's1',
    resumeState: { iterations: 2 },
  });
  expect(paused).toMatchObject({ kind: 'commit_refused', sessionId: 's1' });
  expect(paused.kind === 'commit_refused' && paused.output).toContain('one file is not committed');
  expect(() => pendingRefusal(db, ticketId, 'implement')).toThrow();

  decideRefusal(db, ticketId, { resolution: 'commit', message: 'fix the page, edited' });
  await writeFile(path.join(dir, 'page.ts'), 'export const page = 4; // TODO\n');
  const again = await resumeRefusal(
    { db, runtime },
    'c',
    pendingRefusal(db, ticketId, 'implement'),
  );
  expect(again?.kind).toBe('commit_refused');
  const second = latestRefusal(db, ticketId);
  expect(second).toMatchObject({ resolution: null, message: 'fix the page, edited' });
  expect(second?.diff).toContain('page = 4');

  decideRefusal(db, ticketId, { resolution: 'commit', message: 'fix the page, edited' });
  expect(
    await resumeRefusal({ db, runtime }, 'c', pendingRefusal(db, ticketId, 'implement')),
  ).toBeNull();
  expect(await git('log', '-1', '--format=%s')).toBe('fix the page, edited');
  expect(latestRefusal(db, ticketId)?.resolvedAt).not.toBeNull();
});
