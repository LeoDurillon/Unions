import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { ProjectOption, RepoOption } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const REPO: RepoOption = {
  id: 1,
  nodeId: 'R_1',
  name: 'shop',
  fullName: 'acme/shop',
  owner: 'acme',
  ownerNodeId: 'O_1',
  defaultBranch: 'develop',
  isPrivate: true,
};
const PROJECT: ProjectOption = { id: 'PVT_1', number: 4, title: 'Board', url: 'https://x/4' };

type Call = { method: string; args: unknown[] };

function fakeGitHub(calls: Call[]): OnboardingGitHub {
  return {
    verify: (token) => {
      calls.push({ method: 'verify', args: [token] });
      if (token === 'bad') {
        return Promise.reject(Object.assign(new Error('Bad credentials'), { status: 401 }));
      }
      return Promise.resolve({
        login: 'jo',
        missingScopes: token === 'noscope' ? ['project'] : [],
      });
    },
    listRepos: (token, page) => {
      calls.push({ method: 'listRepos', args: [token, page] });
      return Promise.resolve({ repos: [REPO], hasNext: page < 2 });
    },
    listProjects: (token, owner) => {
      calls.push({ method: 'listProjects', args: [token, owner] });
      return Promise.resolve([PROJECT]);
    },
    createProject: (token, input) => {
      calls.push({ method: 'createProject', args: [token, input] });
      return Promise.resolve({ ...PROJECT, title: input.title });
    },
    getPullRequest: () => Promise.resolve(null),
  };
}

let db: Db;
let app: Hono;
let calls: Call[];

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  calls = [];
  app = createApp(db, fakeGitHub(calls));
});

function post(path: string, body: unknown): Response | Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('verify reports the login and missing scopes; bad tokens map to 401', async () => {
  expect(await (await post('/api/github/verify', { token: 'good' })).json()).toEqual({
    login: 'jo',
    missingScopes: [],
  });
  expect(await (await post('/api/github/verify', { token: 'noscope' })).json()).toEqual({
    login: 'jo',
    missingScopes: ['project'],
  });
  const bad = await post('/api/github/verify', { token: 'bad' });
  expect(bad.status).toBe(401);
  expect(await bad.text()).toContain('rejected this token');
  expect((await post('/api/github/verify', {})).status).toBe(400);
});

test('repos are paged and the page is validated', async () => {
  const second = await post('/api/github/repos', { token: 't', page: 2 });
  expect(await second.json()).toEqual({ repos: [REPO], hasNext: false });
  expect(calls.at(-1)).toEqual({ method: 'listRepos', args: ['t', 2] });
  expect((await post('/api/github/repos', { token: 't', page: 0 })).status).toBe(400);
  const first = await post('/api/github/repos', { token: 't' });
  expect(await first.json()).toEqual({ repos: [REPO], hasNext: true });
});

test('projects are listed per owner and can be created', async () => {
  const listed: unknown = await (
    await post('/api/github/projects', { token: 't', owner: 'acme' })
  ).json();
  expect(listed).toEqual([PROJECT]);
  const created = await post('/api/github/create-project', {
    token: 't',
    ownerId: 'O_1',
    repositoryId: 'R_1',
    title: 'shop board',
  });
  expect(await created.json()).toMatchObject({ id: 'PVT_1', title: 'shop board' });
  expect((await post('/api/github/create-project', { token: 't', title: 'x' })).status).toBe(400);
});

test('a project created with a token stores it but never returns it', async () => {
  const response = await post('/api/projects', {
    owner: 'acme',
    repo: 'shop',
    githubProjectNodeId: 'PVT_1',
    token: 'ghp_secret',
    baseBranch: 'develop',
  });
  expect(response.status).toBe(201);
  const created: unknown = await response.json();
  expect(created).toMatchObject({
    githubProjectNodeId: 'PVT_1',
    hasGithubToken: true,
    config: { baseBranch: 'develop' },
  });
  expect(JSON.stringify(created)).not.toContain('ghp_secret');
  expect(db.select().from(schema.projects).get()?.githubToken).toBe('ghp_secret');

  const list = await (await app.request('/api/projects')).text();
  expect(list).not.toContain('ghp_secret');

  const ticket = await post('/api/tickets', { projectId: 1, title: 't' });
  const { id } = (await ticket.json()) as { id: number };
  expect(await (await app.request(`/api/tickets/${id}`)).text()).not.toContain('ghp_secret');
});
