import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type Project,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentOutcome, AgentRun } from './agent/agent';
import type { Implemented, Prepared } from './implement-run';
import type { StepContext } from './scheduler';
import { sizeAndTrim } from './size-trim';

let db: Db;
let project: Project;
let runs: AgentRun[];
let commands: string[][];

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  project = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      githubProjectNodeId: 'P',
      config: { baseBranch: 'main', gateCommand: 'bun test', maxIterations: 1 },
    })
    .returning()
    .get();
  runs = [];
  commands = [];
});

/** Answers `git diff --numstat` with each size in turn, the checks with `gateExit`, the rest with nothing. */
function runtimeWith(sizes: number[], gateExit = 0): ContainerRuntime {
  let measured = 0;
  return {
    async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
      commands.push(command);
      await Promise.resolve();
      if (command.includes('--numstat')) {
        const code = sizes[Math.min(measured++, sizes.length - 1)] ?? 0;
        yield `${code}\t3\tsrc/search.ts\u0000400\t0\tsrc/search.test.ts\u0000`;
      } else if (command.includes('rev-parse')) {
        yield 'abc123';
      }
      return { exitCode: command[0] === 'sh' ? gateExit : 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
}

const agent: Prepared['deps']['agent'] = (_runtime, run) => {
  runs.push(run);
  const outcome: AgentOutcome = {
    kind: 'ok',
    text: '## Size\nRemoved the cache.',
    sessionId: 's2',
  };
  return Promise.resolve(outcome);
};

function prepared(runtime: ContainerRuntime, revision: StepContext['revision'] = null): Prepared {
  const ticket = createTicket(db, { projectId: project.id, title: 'Add search' });
  db.insert(schema.stepOutputs)
    .values({
      ticketId: ticket.id,
      step: 'technical',
      version: 1,
      content: '## Technical implementation\n…\nEstimated size: 100 lines of code',
      validation: 'approved',
    })
    .run();
  return {
    deps: {
      db,
      runtime,
      config: { image: 'i', gitBaseUrl: 'x', credentialsPath: 'c' },
      github: () => null,
      agent,
    },
    context: {
      ticket,
      step: 'implement',
      revision,
      resumeSessionId: null,
      log: () => {
        // not checked
      },
      signal: new AbortController().signal,
      resume: null,
    },
    project,
    container: 'union-t1',
    branch: 'union/1-add-search',
    base: 'main',
  };
}

const done: Implemented = {
  loop: {
    outcome: { kind: 'ok', text: 'Implemented search.', sessionId: 's1' },
    gate: { green: true, exitCode: 0, tail: '' },
    iterations: 1,
  },
};

function phases(): string[] {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'change_measured'))
    .all()
    .map((event) => JSON.stringify(event.payload));
}

test('a first implementation far over its estimate is sent back once, then measured again', async () => {
  const result = await sizeAndTrim(prepared(runtimeWith([500, 120])), done);
  expect(runs).toHaveLength(1);
  expect(runs[0]?.resumeSessionId).toBe('s1');
  expect(runs[0]?.prompt).toContain('It adds 500 lines of code');
  expect(runs[0]?.prompt).toContain('~100 estimated by the technical plan');
  expect(runs[0]?.prompt).toContain('`src/search.ts`: +500');
  expect(result).toMatchObject({
    loop: { outcome: { sessionId: 's2' }, iterations: 2 },
    note: expect.stringContaining('120 lines of code (+400 tests)') as unknown,
  });
  expect('loop' in result && result.loop.outcome.text).toBe(
    'Implemented search.\n\n## Size\nRemoved the cache.',
  );
  expect(phases()).toEqual([
    '{"code":500,"removed":3,"tests":400,"other":0,"budget":100,"phase":"implemented"}',
    '{"code":120,"removed":3,"tests":400,"other":0,"budget":100,"phase":"trimmed"}',
  ]);
});

test('within the tolerance, or on a revision, the size is only noted', async () => {
  const within = await sizeAndTrim(prepared(runtimeWith([150])), done);
  const revision = { previous: 'r', feedback: 'rename it' };
  await sizeAndTrim(prepared(runtimeWith([900]), revision), done);
  expect(runs).toHaveLength(0);
  expect(within).toMatchObject({
    note: '**Size:** 150 lines of code (+400 tests), 3 removed, for ~100 estimated.',
  });
});

test('a trim pass that breaks the checks is undone and the implementation kept', async () => {
  const result = await sizeAndTrim(prepared(runtimeWith([500], 1)), done);
  expect(commands).toContainEqual(['git', '-C', '/workspace/repo', 'reset', '--hard', 'abc123']);
  expect(result).toMatchObject({
    loop: done.loop,
    note: expect.stringContaining(
      'The trim pass was dropped (the checks failed after it)',
    ) as unknown,
  });
});
