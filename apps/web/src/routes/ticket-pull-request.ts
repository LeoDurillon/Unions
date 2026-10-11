import { getTicket, schema, type Db, type Project, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { PullRequestInfo } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import {
  BAD_REQUEST,
  CONFLICT,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
  requireText,
} from '../http';
import { parsePullRequestRef } from '../pull-request-ref';

export type LinkResult = PullRequestInfo & { warning: string | null };

function load(db: Db, c: Context): { ticket: Ticket; project: Project } {
  const id = requireId(c.req.param('id'), 'ticket id');
  try {
    const ticket = getTicket(db, id);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, ticket.projectId))
      .get();
    if (!project) {
      throw fail(NOT_FOUND, 'Project not found');
    }
    return { ticket, project };
  } catch {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
}

function warningFor(ticket: Ticket, pull: PullRequestInfo): string | null {
  if (ticket.branch && pull.headBranch !== ticket.branch) {
    return `This pull request is from "${pull.headBranch}", not the ticket's branch "${ticket.branch}". New pushes will not reach it.`;
  }
  return null;
}

/** Looks the pull request up on GitHub (read only), then links it to the ticket. */
export async function linkPullRequest(
  db: Db,
  github: OnboardingGitHub,
  c: Context,
): Promise<Response> {
  const { ticket, project } = load(db, c);
  const input = requireText(await readObject(c.req.raw), 'pullRequest');
  const number = parsePullRequestRef(input, project.owner, project.repo);
  if (number === null) {
    throw fail(
      BAD_REQUEST,
      `Give a pull request number or a URL of ${project.owner}/${project.repo}`,
    );
  }
  const token = project.githubToken ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw fail(CONFLICT, 'This project has no GitHub token: set one in the project settings');
  }
  const pull = await github.getPullRequest(
    token,
    { owner: project.owner, repo: project.repo },
    number,
  );
  if (!pull) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} has no pull request #${number}`);
  }
  if (pull.state === 'closed' && !pull.merged) {
    throw fail(CONFLICT, `Pull request #${number} is closed`);
  }
  db.update(schema.tickets)
    .set({ prNumber: pull.number, prReadyAt: pull.draft ? null : Date.now() })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  const result: LinkResult = { ...pull, warning: warningFor(ticket, pull) };
  return c.json(result);
}

/** Forgets the link locally; the pull request itself is left untouched on GitHub. */
export function unlinkPullRequest(db: Db, c: Context): Response {
  const { ticket } = load(db, c);
  db.update(schema.tickets)
    .set({ prNumber: null, prReadyAt: null })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  return c.json({ ok: true });
}
