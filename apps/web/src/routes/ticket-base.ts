// The API routes that show and change the branch a ticket is based on.
import {
  chooseBaseBranch,
  getTicket,
  projectGitHubAuth,
  schema,
  TicketLinkError,
  type Db,
  type GitHubAuth,
  type Project,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { findTicket, summarize } from './ticket-links';

function load(db: Db, c: Context): { ticket: Ticket; project: Project } {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = findTicket(db)(id);
  const project =
    ticket &&
    db.select().from(schema.projects).where(eq(schema.projects.id, ticket.projectId)).get();
  if (!ticket || !project) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  return { ticket, project };
}

function authOf(db: Db, project: Project): GitHubAuth {
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  return auth;
}

function branchOf(body: Record<string, unknown>): string | null {
  const { branch } = body;
  if (branch !== null && typeof branch !== 'string') {
    throw fail(BAD_REQUEST, '"branch" must be a branch name or null');
  }
  const trimmed = branch?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** `GET /api/tickets/:id/branches`: the branches of the ticket's repository, to choose its base. */
async function listBranches(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { project } = load(db, c);
  const repo = { owner: project.owner, repo: project.repo };
  const branches = await github.listBranches(authOf(db, project), repo);
  if (!branches) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} is not reachable`);
  }
  return c.json({ branches, projectBase: project.config.baseBranch });
}

/**
 * `PUT /api/tickets/:id/base-branch` with `{ branch }`: the branch the ticket starts from, over its
 * parent's; null goes back to the automatic choice. The branch must exist on GitHub.
 */
async function chooseBase(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { ticket, project } = load(db, c);
  const branch = branchOf(await readObject(c.req.raw));
  const repo = { owner: project.owner, repo: project.repo };
  if (branch !== null && !(await github.hasBranch(authOf(db, project), repo, branch))) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} has no branch "${branch}"`);
  }
  try {
    const updated = chooseBaseBranch(db, ticket.id, branch);
    return c.json(summarize(updated, (other) => getTicket(db, other)));
  } catch (error) {
    throw error instanceof TicketLinkError ? fail(CONFLICT, error.message) : error;
  }
}

export function ticketBaseRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/:id/branches', (c) => listBranches(db, github, c));
  routes.put('/:id/base-branch', (c) => chooseBase(db, github, c));
  return routes;
}
