import { expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  DEFAULT_TOOLS,
  migrateDb,
  schema,
  type ContainerRuntime,
} from '@union/core';

import { reviewContext, runReviewStep } from './review';

const REVIEW_TOOLS = DEFAULT_TOOLS.final_review;

test('the reviewer can read the change but never edit or run commands beyond git reads', () => {
  expect(REVIEW_TOOLS).toContain('Bash(git diff*)');
  expect(REVIEW_TOOLS).toContain('Bash(git -C /workspace/repo log*)');
  expect(REVIEW_TOOLS).not.toContain('Edit');
  expect(REVIEW_TOOLS).not.toContain('Write');
  expect(REVIEW_TOOLS).not.toContain('Bash');
});

test('the review prompt points at the base...branch diff', () => {
  expect(reviewContext('main', '12-add-search')).toContain('git diff main...HEAD');
  expect(reviewContext('main', '12-add-search')).toContain('`12-add-search`');
  expect(reviewContext('main', '12-add-search')).toContain('one git command per call');
});

test('a ticket without an implementation branch fails clearly, before touching Docker', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 't' });
  const result = await runReviewStep(
    {
      db,
      runtime: {} as ContainerRuntime,
      config: { image: 'i', gitBaseUrl: 'x', credentialsPath: 'c' },
      github: () => null,
      agent: () => Promise.reject(new Error('must not run')),
    },
    {
      ticket,
      step: 'final_review',
      revision: null,
      resumeSessionId: null,
      log: () => {
        // not checked
      },
      signal: new AbortController().signal,
    },
  );
  expect(result).toEqual({
    kind: 'error',
    error: 'No implementation branch to review: run the implementation first.',
  });
});
