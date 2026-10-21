import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db, type GitHubAuth } from '@union/core';
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

/** Calls are recorded with the token, or `app:<installation>` for a GitHub App installation. */
function credential(auth: GitHubAuth): string {
  return auth.kind === 'token' ? auth.token : `app:${auth.installationId}`;
}

function fakeGitHub(calls: Call[]): OnboardingGitHub {
  return {
    verify: (auth) => {
      const token = credential(auth);
      calls.push({ method: 'verify', args: [token] });
      if (token === 'bad') {
        return Promise.reject(Object.assign(new Error('Bad credentials'), { status: 401 }));
      }
      return Promise.resolve({
        login: auth.kind === 'app' ? 'acme' : 'jo',
        missingScopes: token === 'noscope' ? ['project'] : [],
      });
    },
    listRepos: (auth, page) => {
      calls.push({ method: 'listRepos', args: [credential(auth), page] });
      return Promise.resolve({ repos: [REPO], hasNext: page < 2 });
    },
    listProjects: (auth, owner) => {
      calls.push({ method: 'listProjects', args: [credential(auth), owner] });
      return Promise.resolve([PROJECT]);
    },
    createProject: (auth, input) => {
      calls.push({ method: 'createProject', args: [credential(auth), input] });
      return Promise.resolve({ ...PROJECT, title: input.title });
    },
    getPullRequest: () => Promise.resolve(null),
    getDiscussion: () => Promise.resolve(null),
    listPullRequests: () => Promise.resolve(null),
    listStacks: () => Promise.resolve(null),
    pullRequestStack: () => Promise.resolve(null),
    getPullRequestFiles: () => Promise.resolve(null),
    listReviewCommits: () => Promise.resolve(null),
    getCommitFiles: () => Promise.resolve(null),
    getIssue: () => Promise.resolve(null),
    verifyApp: (app) => {
      calls.push({ method: 'verifyApp', args: [app.appId] });
      if (app.appId === '0') {
        return Promise.reject(Object.assign(new Error('Bad credentials'), { status: 401 }));
      }
      return Promise.resolve({ slug: 'union-bot', name: 'Union bot', url: 'https://x/app' });
    },
    listInstallations: () => Promise.resolve([{ id: 7, account: 'acme', allRepositories: false }]),
    listRuleChoices: () => Promise.reject(new Error('unused')),
    listProjectFields: () => Promise.reject(new Error('unused')),
    listBranches: () => Promise.resolve(null),
    hasBranch: () => Promise.resolve(false),
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
  expect(await bad.text()).toContain('rejected these credentials');
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
    githubAccess: 'token',
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

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----';

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('the GitHub App is verified before it is stored, and its key is never returned', async () => {
  expect(await (await app.request('/api/github/app')).json()).toEqual({ configured: false });
  expect((await send('PUT', '/api/github/app', { appId: '42', privateKey: 'nope' })).status).toBe(
    400,
  );
  expect((await send('PUT', '/api/github/app', { appId: '0', privateKey: PEM })).status).toBe(401);
  expect(db.select().from(schema.githubApp).all()).toHaveLength(0);

  const saved = await send('PUT', '/api/github/app', { appId: '42', privateKey: PEM });
  const status = await saved.text();
  expect(JSON.parse(status)).toEqual({
    configured: true,
    appId: '42',
    slug: 'union-bot',
    name: 'Union bot',
    url: 'https://github.com/apps/union-bot',
  });
  expect(status).not.toContain('PRIVATE KEY');
  expect(await (await app.request('/api/github/app/installations')).json()).toEqual([
    { id: 7, account: 'acme', allRepositories: false },
  ]);
});

test('wizard calls and new projects can use an installation once the app is set up', async () => {
  expect((await post('/api/github/repos', { installationId: 7 })).status).toBe(409);
  expect((await post('/api/github/repos', { installationId: 'x' })).status).toBe(400);
  await send('PUT', '/api/github/app', { appId: '42', privateKey: PEM });

  expect(await (await post('/api/github/verify', { installationId: 7 })).json()).toEqual({
    login: 'acme',
    missingScopes: [],
  });
  await post('/api/github/projects', { installationId: 7, owner: 'acme' });
  expect(calls.at(-1)).toEqual({ method: 'listProjects', args: ['app:7', 'acme'] });

  const response = await post('/api/projects', {
    owner: 'acme',
    repo: 'shop',
    githubProjectNodeId: 'PVT_1',
    installationId: 7,
  });
  expect(await response.json()).toMatchObject({ githubAccess: 'app', githubInstallationId: 7 });
  expect(db.select().from(schema.projects).get()?.githubToken).toBeNull();
});

test('a project switches between token and installation; the app cannot go while used', async () => {
  await send('PUT', '/api/github/app', { appId: '42', privateKey: PEM });
  await post('/api/projects', {
    owner: 'acme',
    repo: 'shop',
    githubProjectNodeId: 'P',
    token: 't',
  });

  const toApp = await send('PATCH', '/api/projects/1', { installationId: 7 });
  expect(await toApp.json()).toMatchObject({ githubAccess: 'app', githubInstallationId: 7 });
  expect(db.select().from(schema.projects).get()?.githubToken).toBeNull();
  const busy = await send('DELETE', '/api/github/app');
  expect(busy.status).toBe(409);
  expect(await busy.text()).toContain('acme/shop');

  const toToken = await send('PATCH', '/api/projects/1', { token: 'ghp_new' });
  expect(await toToken.json()).toMatchObject({ githubAccess: 'token', githubInstallationId: null });
  expect(await (await send('DELETE', '/api/github/app')).json()).toEqual({ configured: false });
});
