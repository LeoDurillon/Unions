// Tests the install-then-check run of a setup proposal: stages, a failed install, a skipped command, a timeout.

import { beforeEach, expect, test } from 'bun:test';

import {
  claimSetupCheck,
  createDb,
  latestSetupChecks,
  migrateDb,
  queueSetupCheck,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecOptions,
  type ExecResult,
} from '@union/core';

import { runSetupCommands } from './setup-check-commands';

type Behaviour = { lines: string[]; exitCode: number } | 'hang';

let db: Db;
let checkId: number;
let investigationId: number;
let ran: string[];
/** What each command does, by the command given (`sh -lc '<command> 2>&1'`). */
let behaviours: Record<string, Behaviour>;
/** The check's stage while each command ran. */
let stages: (string | null)[];

function stageNow(): string | null {
  return latestSetupChecks(db, investigationId).checks?.stage ?? null;
}

const runtime = {
  async *exec(_name: string, command: string[], options: ExecOptions = {}) {
    const script = (command[2] ?? '').replace(/ 2>&1$/u, '');
    ran.push(script);
    stages.push(stageNow());
    const behaviour = behaviours[script] ?? { lines: [], exitCode: 0 };
    if (behaviour === 'hang') {
      await new Promise((resolve) => {
        options.signal?.addEventListener('abort', resolve);
      });
      return { exitCode: 137, stderr: '' } satisfies ExecResult;
    }
    yield* behaviour.lines;
    return { exitCode: behaviour.exitCode, stderr: '' } satisfies ExecResult;
  },
} as unknown as ContainerRuntime;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  investigationId = db
    .insert(schema.investigations)
    .values({ projectId, title: 't', prompt: 'p', scope: 'repository', model: 'sonnet', tools: [] })
    .returning()
    .get().id;
  queueSetupCheck(db, investigationId, { kind: 'checks', installCommand: 'i', gateCommand: 'g' });
  checkId = claimSetupCheck(db)?.id ?? 0;
  ran = [];
  stages = [];
  behaviours = {};
});

function run(
  installCommand: string,
  gateCommand: string,
  signal = new AbortController().signal,
): ReturnType<typeof runSetupCommands> {
  return runSetupCommands(
    { db, runtime },
    { checkId, container: 'union-sc1', installCommand, gateCommand },
    signal,
  );
}

test('installs, then runs the check command, each at its stage', async () => {
  behaviours = { 'bun test': { lines: ['12 pass'], exitCode: 0 } };
  expect(await run('bun install', 'bun test')).toEqual({ status: 'passed', output: '12 pass' });
  expect(ran).toEqual(['bun install', 'bun test']);
  expect(stages).toEqual(['installing', 'checking']);
});

test('stops at a failed install, with its output and exit code', async () => {
  behaviours = { 'bun install': { lines: ['lockfile is stale'], exitCode: 1 } };
  const outcome = await run('bun install', 'bun test');
  expect(outcome.status).toBe('failed');
  expect(outcome.output).toContain('lockfile is stale');
  expect(outcome.output).toContain('The install command failed (exit 1).');
  expect(ran).toEqual(['bun install']);
  expect(stageNow()).toBe('installing');
});

test('skips an empty install command', async () => {
  behaviours = { 'bun test': { lines: ['1 fail'], exitCode: 1 } };
  const outcome = await run('  ', 'bun test');
  expect(ran).toEqual(['bun test']);
  expect(outcome.output).toContain('The check command failed (exit 1).');
});

test('a stopped worker is not reported as a timeout', async () => {
  behaviours = { 'bun install': 'hang' };
  const stop = new AbortController();
  const outcome = run('bun install', 'bun test', stop.signal);
  stop.abort();
  expect((await outcome).status).toBe('failed');
});
