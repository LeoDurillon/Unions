// The project settings' GitHub Project: listing, connecting (picked or created), disconnecting, and mirroring kept on with one.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { ProjectOption } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const BOARD: ProjectOption = {
  id: 'PVT_9',
  number: 9,
  title: 'Board',
  url: 'https://github.com/orgs/o/projects/9',
};

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;
let created: unknown[];

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  created = [];
  const github = {
    listProjects: () => Promise.resolve([BOARD]),
    repositoryIds: () => Promise.resolve({ repositoryId: 'R_1', ownerId: 'O_1' }),
    createProject: (_auth: unknown, input: { title: string }) => {
      created.push(input);
      return Promise.resolve({ ...BOARD, id: 'PVT_new', title: input.title });
    },
  } as unknown as OnboardingGitHub;
  app = createApp(db, github);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      githubToken: 't',
      config: { baseBranch: 'main', mirrorIssues: false },
    })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Fix' }).id;
});

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(`/api/projects/${projectId}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function stored(): typeof schema.projects.$inferSelect | undefined {
  return db.select().from(schema.projects).get();
}

test('lists the owner’s Projects with the project’s own credentials', async () => {
  const response = await send('GET', '/github-project/choices');
  expect(await response.json()).toEqual([BOARD]);
});

test('connecting a picked Project stores it and turns mirroring on', async () => {
  const response = await send('PUT', '/github-project', { nodeId: BOARD.id, url: BOARD.url });
  expect(response.status).toBe(200);
  expect(stored()).toMatchObject({
    githubProjectNodeId: 'PVT_9',
    githubProjectUrl: BOARD.url,
    config: { mirrorIssues: true },
  });
  expect((await send('PATCH', '', { mirrorIssues: false })).status).toBe(409);
});

test('connecting a new Project creates it for the repository', async () => {
  await send('PUT', '/github-project', { title: 'Our board' });
  expect(created).toEqual([{ repositoryId: 'R_1', ownerId: 'O_1', title: 'Our board' }]);
  expect(stored()?.githubProjectNodeId).toBe('PVT_new');
});

test('a bad choice is refused', async () => {
  expect((await send('PUT', '/github-project', { nodeId: 'x', url: 'nope' })).status).toBe(400);
  expect((await send('PUT', '/github-project', {})).status).toBe(400);
});

test('disconnecting clears the board and the tickets’ items; mirroring stays on, then can go off', async () => {
  await send('PUT', '/github-project', { nodeId: BOARD.id, url: BOARD.url });
  db.update(schema.tickets).set({ projectItemId: 'item_1', githubSyncedStatus: 'backlog' }).run();
  await send('DELETE', '/github-project');
  expect(stored()).toMatchObject({
    githubProjectNodeId: '',
    githubProjectUrl: null,
    config: { mirrorIssues: true },
  });
  expect(getTicket(db, ticketId)).toMatchObject({ projectItemId: null, githubSyncedStatus: null });
  expect((await send('PATCH', '', { mirrorIssues: false })).status).toBe(200);
  expect(stored()?.config.mirrorIssues).toBe(false);
});
