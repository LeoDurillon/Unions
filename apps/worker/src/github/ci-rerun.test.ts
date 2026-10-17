import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { RequestError } from 'octokit';

import { rerunCiJob } from './ci-rerun';
import { FakeGitHubApi } from './fake-api';

const FORBIDDEN = 403;
const JOB = { jobId: 42, name: 'Fail on findings' };

let db: Db;
let api: FakeGitHubApi;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search', body: '' }).id;
});

function logged(): { type: string; payload: unknown }[] {
  return db
    .select({ type: schema.events.type, payload: schema.events.payload })
    .from(schema.events)
    .all()
    .filter((event) => event.type.startsWith('ci_job_rerun'));
}

test('the job is run again and the ticket logs it', async () => {
  await rerunCiJob(db, () => api, ticketId, JOB);
  expect(api.reruns).toEqual([JOB.jobId]);
  expect(logged()).toEqual([{ type: 'ci_job_rerun', payload: JOB }]);
});

test('a refusal is logged with the permission it needs', async () => {
  api.rerunJob = (): Promise<void> =>
    Promise.reject(
      new RequestError('Resource not accessible by integration', FORBIDDEN, {
        request: { method: 'POST', url: 'https://api.github.com', headers: {} },
      }),
    );
  await rerunCiJob(db, () => api, ticketId, JOB);
  expect(logged()).toMatchObject([{ type: 'ci_job_rerun_failed', payload: JOB }]);
  expect(JSON.stringify(logged())).toContain('Actions read and write');
});

test('a project without credentials fails the re-run', async () => {
  await rerunCiJob(db, () => null, ticketId, JOB);
  expect(logged()).toMatchObject([
    {
      type: 'ci_job_rerun_failed',
      payload: { ...JOB, error: 'This project has no GitHub credentials' },
    },
  ]);
});
