import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type ExecResult,
} from '@union/core';

import { AGENT_HOME, cloneInto, cloneSource, ensureTicketContainer } from './provision';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test('a token is embedded for https and kept out of the public url', () => {
  expect(cloneSource('https://github.com', 'acme', 'shop', 'ghp_x/y')).toEqual({
    url: 'https://x-access-token:ghp_x%2Fy@github.com/acme/shop.git',
    publicUrl: 'https://github.com/acme/shop.git',
    secret: 'ghp_x/y',
  });
  expect(cloneSource('https://github.com', 'acme', 'shop', null).url).toBe(
    'https://github.com/acme/shop.git',
  );
  expect(cloneSource('file:///tmp/src', 'o', 'r', 'tok').url).toBe('file:///tmp/src/o/r.git');
});

async function run(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'ignore', stderr: 'ignore' });
  expect(await proc.exited).toBe(0);
}

test('the copied repository has a token-free origin', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'union-clone-test-'));
  cleanup.push(root);
  const work = path.join(root, 'work');
  await run(['git', 'init', '-q', '-b', 'main', work]);
  await Bun.write(path.join(work, 'README.md'), '# r\n');
  await run(['git', '-C', work, 'add', '-A']);
  await run([
    'git',
    '-C',
    work,
    '-c',
    'user.email=a@b',
    '-c',
    'user.name=t',
    'commit',
    '-qm',
    'init',
  ]);

  let copiedConfig = '';
  const runtime = {
    copyIn: async (_name: string, hostDir: string) => {
      copiedConfig = await readFile(path.join(hostDir, '.git', 'config'), 'utf8');
    },
  } as unknown as ContainerRuntime;
  const source = { url: work, publicUrl: 'https://github.com/o/r.git', secret: 'ghp_secret' };
  await cloneInto(runtime, 'c', source, 'main');
  expect(copiedConfig).toContain('url = https://github.com/o/r.git');
  expect(copiedConfig).not.toContain('ghp_secret');
});

test('git errors never include the token', async () => {
  const runtime = { copyIn: () => Promise.resolve() } as unknown as ContainerRuntime;
  const source = cloneSource('https://127.0.0.1:9', 'o', 'r', 'ghp_secret');
  const failure = await cloneInto(runtime, 'c', source, 'main').catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain('ghp_secret');
});

test('every run hands the ticket container the host login as it is now', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'union-seed-test-'));
  cleanup.push(root);
  const credentialsPath = path.join(root, 'credentials.json');
  const db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 't' });
  const written: string[] = [];
  // A container already set up: running, with its clone and a login seeded by an earlier run.
  const runtime = {
    create: () => Promise.resolve(),
    isRunning: () => Promise.resolve(true),
    writeFile: (_name: string, file: string, content: string) => {
      if (file === `${AGENT_HOME}/.claude/.credentials.json`) {
        written.push(content);
      }
      return Promise.resolve();
    },
    // The commands print nothing and succeed.
    *exec(): Generator<string, ExecResult> {
      yield* [];
      return { exitCode: 0, stderr: '' };
    },
    // No project files: the workspace check finds nothing to do.
    *runHelper(): Generator<string, ExecResult> {
      yield* [];
      return { exitCode: 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
  const config = { image: 'i', gitBaseUrl: 'x', credentialsPath };

  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'first' } }));
  await ensureTicketContainer(db, runtime, config, ticket);
  // The host refreshed its login between the runs.
  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'second' } }));
  await ensureTicketContainer(db, runtime, config, ticket);
  expect(written.map((content) => JSON.parse(content) as unknown)).toEqual([
    { claudeAiOauth: { accessToken: 'first' } },
    { claudeAiOauth: { accessToken: 'second' } },
  ]);
});
