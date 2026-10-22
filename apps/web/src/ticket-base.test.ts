import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  migrateDb,
  schema,
  setParent,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { TicketDetail } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const BRANCHES = ['main', 'release'];
const unused = (): Promise<never> => Promise.reject(new Error('unused'));

const github: OnboardingGitHub = {
  verify: unused,
  listRepos: unused,
  listProjects: unused,
  createProject: unused,
  getPullRequest: unused,
  getDiscussion: unused,
  listPullRequests: unused,
  listStacks: unused,
  pullRequestStack: unused,
  getPullRequestFiles: unused,
  listBranches: () => Promise.resolve(BRANCHES),
  hasBranch: (_auth, _repo, branch) => Promise.resolve(BRANCHES.includes(branch)),
  listReviewCommits: unused,
  getCommitFiles: unused,
  getIssue: unused,
  verifyApp: unused,
  listInstallations: unused,
  listRuleChoices: unused,
  listProjectFields: unused,
};

let db: Db;
let app: Hono;
let ticketId: number;
let parentId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  const project = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      githubProjectNodeId: 'P',
      githubToken: 'tok',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get();
  parentId = createTicket(db, { projectId: project.id, title: 'Parent' }).id;
  db.update(schema.tickets)
    .set({ branch: '1-parent', prNumber: 4, prState: 'open', phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, parentId))
    .run();
  ticketId = createTicket(db, { projectId: project.id, title: 'Child' }).id;
  setParent(db, ticketId, parentId);
});

function choose(branch: string | null): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/base-branch`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branch }),
  });
}

async function base(): Promise<TicketDetail['base']> {
  const detail = (await (await app.request(`/api/tickets/${ticketId}`)).json()) as TicketDetail;
  return detail.base;
}

test("a chosen branch overrides the parent's; null goes back to the parent's", async () => {
  expect(await base()).toEqual({ branch: '1-parent', reason: 'parent', fixed: false });
  expect((await choose('release')).status).toBe(200);
  expect(getTicket(db, ticketId).chosenBaseBranch).toBe('release');
  expect(await base()).toEqual({ branch: 'release', reason: 'chosen', fixed: false });
  expect((await choose(null)).status).toBe(200);
  expect(await base()).toEqual({ branch: '1-parent', reason: 'parent', fixed: false });
});

test('a branch missing on GitHub or a started ticket is refused, nothing stored', async () => {
  expect((await choose('nope')).status).toBe(404);
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'intake' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await choose('release')).status).toBe(409);
  expect(getTicket(db, ticketId).chosenBaseBranch).toBeNull();
});

test("the branches are the repository's, with the project's base", async () => {
  const response = await app.request(`/api/tickets/${ticketId}/branches`);
  expect(await response.json()).toEqual({ branches: BRANCHES, projectBase: 'main' });
});

function retarget(branch: string): Response | Promise<Response> {
  return app.request(`/api/tickets/${parentId}/retarget`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branch }),
  });
}

test('a change of target is queued for an open pull request, onto a branch GitHub has', async () => {
  expect((await retarget('nope')).status).toBe(404);
  expect((await retarget('main')).status).toBe(409);
  const queued = await retarget('release');
  expect(queued.status).toBe(202);
  const command = db.select().from(schema.commands).get();
  expect(command).toMatchObject({
    type: 'retarget',
    ticketId: parentId,
    payload: { branch: 'release' },
  });
  expect((await retarget('release')).status).toBe(409);
});

test('a change of target is refused before the final review, or once the PR is merged', async () => {
  db.update(schema.tickets).set({ prState: 'merged' }).where(eq(schema.tickets.id, parentId)).run();
  expect((await retarget('release')).status).toBe(409);
  db.update(schema.tickets)
    .set({ prState: 'open', phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, parentId))
    .run();
  expect((await retarget('release')).status).toBe(409);
});
