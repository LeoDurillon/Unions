import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  resolveAgent,
  saveAgent,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type Project,
} from '@union/core';

import type { AgentOutcome, AgentRun } from './agent';
import { implementLoop, type ImplementDeps, type Workspace } from './implement-loop';
import { renderImplementReport } from './implement-prompts';
import type { StepContext } from './scheduler';

type Reply = { exitCode: number; lines: string[] };

/** A container whose commands are answered by `reply`; every command is recorded. */
function fakeRuntime(reply: (command: string[]) => Reply): {
  runtime: ContainerRuntime;
  commands: string[][];
} {
  const commands: string[][] = [];
  const runtime = {
    async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
      commands.push(command);
      const answer = reply(command);
      for (const line of answer.lines) {
        yield line;
      }
      await Promise.resolve();
      return { exitCode: answer.exitCode, stderr: '' };
    },
  } as unknown as ContainerRuntime;
  return { runtime, commands };
}

let db: Db;
let project: Project;
let runs: AgentRun[];

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  project = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      githubProjectNodeId: 'P',
      config: { baseBranch: 'main', gateCommand: 'bun test', maxIterations: 3 },
    })
    .returning()
    .get();
  runs = [];
});

function workspace(
  runtime: ContainerRuntime,
  outcomes: AgentOutcome[],
  revision: StepContext['revision'] = null,
): Workspace {
  const ticket = createTicket(db, { projectId: project.id, title: 'Add search' });
  const agent: ImplementDeps['agent'] = (_runtime, run) => {
    runs.push(run);
    return Promise.resolve(
      outcomes[runs.length - 1] ?? { kind: 'error', message: 'no more outcomes' },
    );
  };
  const context: StepContext = {
    ticket,
    step: 'implement',
    revision,
    resumeSessionId: revision ? 'session-0' : null,
    log: () => {
      // events are not checked here
    },
    signal: new AbortController().signal,
  };
  return {
    deps: {
      db,
      runtime,
      config: { image: 'i', gitBaseUrl: 'x', credentialsPath: 'c' },
      github: () => null,
      agent,
    },
    context,
    project,
    container: 'union-t1',
  };
}

const ok = (n: number): AgentOutcome => ({
  kind: 'ok',
  text: `report ${n}`,
  sessionId: `session-${n}`,
  costUsd: null,
});
const isGate = (command: string[]): boolean => command[0] === 'sh';

test('green checks after the first turn end the loop', async () => {
  const { runtime } = fakeRuntime(() => ({ exitCode: 0, lines: [] }));
  const loop = await implementLoop(workspace(runtime, [ok(1)]));
  expect(loop).toMatchObject({ iterations: 1, gate: { green: true } });
  expect(runs).toHaveLength(1);
  expect(runs[0]?.prompt).toContain('the checks run with `bun test`');
  expect(runs[0]?.denied).toContain('Bash(git checkout*)');
  expect(runs[0]?.tools).toEqual(['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash']);
});

test('the agent runs with the tools selected in the agent settings', async () => {
  const { prompt, model } = resolveAgent(db, 'implement');
  saveAgent(db, 'implement', { prompt, model, tools: ['Read', 'Edit', 'Bash', 'Skill'] });
  const { runtime } = fakeRuntime(() => ({ exitCode: 0, lines: [] }));
  await implementLoop(workspace(runtime, [ok(1)]));
  expect(runs[0]?.tools).toEqual(['Read', 'Edit', 'Bash', 'Skill']);
  expect(runs[0]?.denied).toContain('Bash(git checkout*)');
});

test('red checks resume the same session with the failure, until green', async () => {
  let gateRuns = 0;
  const { runtime } = fakeRuntime((command) => {
    if (isGate(command)) {
      gateRuns += 1;
      return {
        exitCode: gateRuns === 1 ? 1 : 0,
        lines: gateRuns === 1 ? ['FAIL search.test.ts'] : [],
      };
    }
    return { exitCode: 0, lines: [] };
  });
  const loop = await implementLoop(workspace(runtime, [ok(1), ok(2)]));
  expect(loop).toMatchObject({ iterations: 2, gate: { green: true } });
  expect(runs[1]?.resumeSessionId).toBe('session-1');
  expect(runs[1]?.prompt).toContain('FAIL search.test.ts');
});

test('the loop stops at the iteration limit with the checks still red', async () => {
  const { runtime } = fakeRuntime((command) => ({ exitCode: isGate(command) ? 2 : 0, lines: [] }));
  const loop = await implementLoop(workspace(runtime, [ok(1), ok(2), ok(3), ok(4)]));
  expect(loop).toMatchObject({ iterations: 3, gate: { green: false, exitCode: 2 } });
  expect(runs).toHaveLength(3);
});

test('uncommitted changes are committed by the host after each turn', async () => {
  const { runtime, commands } = fakeRuntime((command) =>
    command.includes('--porcelain')
      ? { exitCode: 0, lines: [' M src/search.ts'] }
      : { exitCode: 0, lines: [] },
  );
  await implementLoop(workspace(runtime, [ok(1)]));
  expect(commands.some((command) => command.includes('commit'))).toBe(true);
});

test('a revision resumes the previous session with the user feedback', async () => {
  const { runtime } = fakeRuntime(() => ({ exitCode: 0, lines: [] }));
  await implementLoop(
    workspace(runtime, [ok(1)], { previous: 'old report', feedback: 'Use a trie.' }),
  );
  expect(runs[0]).toMatchObject({ resumeSessionId: 'session-0' });
  expect(runs[0]?.prompt).toContain('Use a trie.');
});

test('an agent failure stops the loop before the checks run', async () => {
  const { runtime, commands } = fakeRuntime(() => ({ exitCode: 0, lines: [] }));
  const loop = await implementLoop(
    workspace(runtime, [{ kind: 'rate_limited', message: 'limit' }]),
  );
  expect(loop.outcome.kind).toBe('rate_limited');
  expect(commands.some((command) => isGate(command))).toBe(false);
});

test('the report says what the host checked and published', () => {
  const base = {
    agentReport: 'Added search.',
    gateCommand: 'bun test',
    iterations: 2,
    branch: '12-add-search',
    ahead: 3,
    base: 'main',
  };
  const green = renderImplementReport({
    ...base,
    gate: { green: true, exitCode: 0, tail: '' },
    publish: { pushed: true, pullRequest: 34, manualPullRequest: false, error: null },
  });
  expect(green).toContain('passing after 2 iterations');
  expect(green).toContain('pushed · PR #34');
  expect(green).toContain('3 ahead of `main`');
  const red = renderImplementReport({
    ...base,
    gate: { green: false, exitCode: 1, tail: 'FAIL x' },
    publish: { pushed: false, pullRequest: null, manualPullRequest: false, error: 'auth' },
  });
  expect(red).toContain('still failing after 2 iterations (exit 1)');
  expect(red).toContain('FAIL x');
  expect(red).toContain('push failed: auth');
});

test('a lost session (rebuilt HOME volume) is retried in a fresh session with the full context', async () => {
  const { runtime } = fakeRuntime(() => ({ exitCode: 0, lines: [] }));
  const lost: AgentOutcome = {
    kind: 'error',
    message: 'claude exited with 1 and no result: No conversation found with session ID: session-0',
  };
  const loop = await implementLoop(
    workspace(runtime, [lost, ok(1)], { previous: 'old report', feedback: 'Remove multiply.' }),
  );
  expect(loop).toMatchObject({ iterations: 1, outcome: { kind: 'ok' } });
  expect(runs[0]).toMatchObject({ resumeSessionId: 'session-0' });
  expect(runs[1]?.resumeSessionId).toBeNull();
  expect(runs[1]?.prompt).toContain('# Your job');
  expect(runs[1]?.prompt).toContain('Remove multiply.');
});

test('other agent errors are not retried', async () => {
  const { runtime } = fakeRuntime(() => ({ exitCode: 0, lines: [] }));
  await implementLoop(
    workspace(runtime, [{ kind: 'error', message: 'boom' }, ok(1)], {
      previous: 'r',
      feedback: 'f',
    }),
  );
  expect(runs).toHaveLength(1);
});

test('with automatic pull requests off, the report says how to link one', () => {
  const report = renderImplementReport({
    agentReport: 'Done.',
    gateCommand: undefined,
    gate: null,
    iterations: 1,
    branch: '12-add-search',
    ahead: 1,
    base: 'main',
    publish: { pushed: true, pullRequest: null, manualPullRequest: true, error: null },
  });
  expect(report).toContain('automatic creation is off');
  expect(report).toContain('PR tab');
});
