// Tests the lists a Jira field rule picks from: read from the project's Jira with its token, nothing stored.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  migrateDb,
  saveIntegration,
  schema,
  type Db,
  type JiraApi,
  type NotionApi,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

let db: Db;
let app: Hono;
let projectId: number;
let reads: { path: string; token: string }[];

const jira = {
  read: (auth, path) => {
    reads.push({ path, token: auth.token });
    return Promise.resolve([{ id: '5', name: 'API' }]);
  },
} satisfies Partial<JiraApi> as unknown as JiraApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, {} as NotionApi, { jira });
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  reads = [];
});

function picks(type: string): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/jira/picks/${type}`);
}

test("a list is read from the project's Jira project with its token", async () => {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  const response = await picks('components');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{ id: '5', name: 'API' }]);
  expect(reads).toEqual([{ path: '/project/ABC/components', token: 'tok' }]);
});

test('a project without Jira, or a type without a list, is refused', async () => {
  expect((await picks('components')).status).toBe(409);
  expect((await picks('text')).status).toBe(400);
  expect((await picks('nonsense')).status).toBe(400);
  expect(reads).toEqual([]);
});
