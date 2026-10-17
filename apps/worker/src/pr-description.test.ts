import { expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn, AgentRun } from './agent';
import { FakeGitHubApi } from './github/fake-api';
import { descriptionPrompt, pickTemplate, writeDescription } from './pr-description';
import { ensurePullRequest, pullRequestBody } from './publish';

const TEMPLATE =
  '## Description\n\n## Type de changement\n\n- [ ] Correctif\n- [ ] Fonctionnalité\n';

/** A container where `find` lists `files` and `cat` prints the template. */
function runtimeWith(files: string[]): ContainerRuntime {
  return {
    async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
      await Promise.resolve();
      if (command[0] === 'sh') {
        yield* files;
      } else if (command[0] === 'cat') {
        yield* TEMPLATE.split('\n');
      }
      return { exitCode: 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
}

function log(): void {
  // Agent events are not checked here.
}

const fails: AgentFn = () => Promise.resolve({ kind: 'error', message: 'boom' });

function setup(): { db: ReturnType<typeof createDb>; ticketId: number } {
  const db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticketId = createTicket(db, {
    projectId: project.id,
    title: 'Add search',
    body: 'Body',
  }).id;
  return { db, ticketId };
}

test('the template GitHub would use: its folders in order, any case, else the first of a folder', () => {
  expect(
    pickTemplate(['./docs/pull_request_template.md', './.github/PULL_REQUEST_TEMPLATE.md']),
  ).toBe('.github/PULL_REQUEST_TEMPLATE.md');
  expect(pickTemplate(['./Pull_Request_Template.md', './docs/pull_request_template.md'])).toBe(
    'Pull_Request_Template.md',
  );
  expect(
    pickTemplate([
      './.github/PULL_REQUEST_TEMPLATE/feature.md',
      './.github/PULL_REQUEST_TEMPLATE/bug.md',
    ]),
  ).toBe('.github/PULL_REQUEST_TEMPLATE/bug.md');
  expect(pickTemplate(['./node_modules/x/pull_request_template.md', './README.md'])).toBeNull();
});

test('the prompt asks to fill the template in its own language, else for a short summary', () => {
  const filled = descriptionPrompt({ path: '.github/pull_request_template.md', text: TEMPLATE });
  expect(filled).toContain(
    "Fill in the repository's pull request template (`.github/pull_request_template.md`)",
  );
  expect(filled).toContain('write in the language the template is written in');
  expect(filled).toContain('## Type de changement');
  expect(descriptionPrompt(null)).toContain('in the language the ticket is written in');
});

test('the implementer writes the description in its own session; a failed turn keeps the default', async () => {
  const { db } = setup();
  const runs: AgentRun[] = [];
  const writes: AgentFn = (_runtime, run) => {
    runs.push(run);
    return Promise.resolve({
      kind: 'ok',
      text: ' ## Description\n\nAjoute la recherche. ',
      sessionId: 's',
    });
  };
  const { signal } = new AbortController();
  const runtime = runtimeWith(['./.github/pull_request_template.md']);

  const text = await writeDescription(runtime, 'union-t1', {
    db,
    agent: writes,
    sessionId: 'impl-1',
    signal,
    log,
  });
  expect(text).toBe('## Description\n\nAjoute la recherche.');
  expect(runs[0]).toMatchObject({ resumeSessionId: 'impl-1', model: 'opus' });
  expect(runs[0]?.prompt).toContain('## Type de changement');
  expect(runs[0]?.tools).not.toContain('Edit');

  expect(
    await writeDescription(runtime, 'union-t1', { db, agent: fails, sessionId: null, signal, log }),
  ).toBeNull();
});

test('the body is the description, then the links the worker adds', () => {
  const { db, ticketId } = setup();
  expect(pullRequestBody(db, getTicket(db, ticketId), 'Adds search.')).toBe('Adds search.');
  db.update(schema.tickets).set({ issueNumber: 9 }).where(eq(schema.tickets.id, ticketId)).run();
  expect(pullRequestBody(db, getTicket(db, ticketId), 'Adds search.')).toBe(
    'Adds search.\n\nCloses #9',
  );
  expect(pullRequestBody(db, getTicket(db, ticketId))).toBe('Closes #9');
});

test('a new pull request is described; an existing one is left as it is', async () => {
  const { db, ticketId } = setup();
  const github = new FakeGitHubApi();
  let asked = 0;
  const describe = (): Promise<string> => {
    asked += 1;
    return Promise.resolve('Adds search.');
  };
  const project = db.select().from(schema.projects).get();
  if (!project) {
    throw new Error('project missing');
  }
  const input = {
    db,
    github,
    project,
    ticket: getTicket(db, ticketId),
    branch: '1-add-search',
    base: 'main',
    describe,
  };
  await ensurePullRequest(input);
  expect(github.pulls[0]?.body).toBe('Adds search.');
  await ensurePullRequest(input);
  expect(asked).toBe(1);
  expect(github.pulls).toHaveLength(1);
});
