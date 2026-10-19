import { createTicket, projectGitHubAuth, schema, type Db, type Project } from '@union/core';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { GitHubIssue, IssueImport } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireText } from '../http';
import { parseIssueRef } from '../pull-request-ref';
import { guarded } from './github-errors';
import { flowOf } from './ticket-flow';
import { findTicket, summarize } from './ticket-links';

/** The project and the issue the body names, read from GitHub; pull requests are refused. */
async function fetchIssue(
  db: Db,
  github: OnboardingGitHub,
  body: Record<string, unknown>,
): Promise<{ project: Project; issue: GitHubIssue }> {
  const projectId = Number(body.projectId);
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw fail(BAD_REQUEST, 'Unknown project');
  }
  const number = parseIssueRef(requireText(body, 'issue'), project.owner, project.repo);
  if (number === null) {
    throw fail(BAD_REQUEST, `Give an issue number or a URL of ${project.owner}/${project.repo}`);
  }
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  const repo = { owner: project.owner, repo: project.repo };
  const issue = await guarded(() => github.getIssue(auth, repo, number));
  if (!issue) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} has no issue #${number}`);
  }
  if (issue.pullRequest) {
    throw fail(BAD_REQUEST, `#${number} is a pull request, not an issue`);
  }
  return { project, issue };
}

/** The project's ticket already on that issue, if any. */
function ticketOf(db: Db, projectId: number, number: number): number | null {
  const row = db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(and(eq(schema.tickets.projectId, projectId), eq(schema.tickets.issueNumber, number)))
    .get();
  return row?.id ?? null;
}

async function preview(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { project, issue } = await fetchIssue(db, github, await readObject(c.req.raw));
  const result: IssueImport = {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    url: issue.url,
    state: issue.state,
    ticketId: ticketOf(db, project.id, issue.number),
  };
  return c.json(result);
}

/** A ticket on the issue itself: GitHub keeps owning its title and description. */
async function create(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  const { project, issue } = await fetchIssue(db, github, body);
  const existing = ticketOf(db, project.id, issue.number);
  if (existing !== null) {
    throw fail(CONFLICT, `#${issue.number} is already ticket ${existing}`);
  }
  const ticket = createTicket(db, {
    projectId: project.id,
    title: issue.title,
    body: issue.body,
    issue: { number: issue.number, nodeId: issue.nodeId },
    flow: flowOf(db, body) ?? null,
  });
  return c.json(summarize(ticket, findTicket(db)), CREATED);
}

/** `/api/tickets/github-issue`: a ticket from an existing issue of the project's repository. */
export function issueImportRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.post('/preview', (c) => preview(db, github, c));
  routes.post('/', (c) => create(db, github, c));
  return routes;
}
