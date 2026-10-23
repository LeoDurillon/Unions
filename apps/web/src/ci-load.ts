// Loading a ticket's PR checks: the ticket, the pull request picked (its own or a slice's), the credentials, and GitHub's listing.
import { getTicket, projectGitHubAuth, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { PullRequestChecks } from './ci-api-types';
import type { CiSource } from './ci-picks';
import type { CiGitHub } from './github-checks';
import { BAD_GATEWAY, CONFLICT, fail, NOT_FOUND, requireId } from './http';
import { guarded } from './routes/github-errors';
import { pickedPullRequest } from './ticket-pull-request';

const FORBIDDEN = 403;

export type Loaded = { ticket: Ticket; number: number; source: CiSource };

export function loadTicket(db: Db, c: Context): Ticket {
  try {
    return getTicket(db, requireId(c.req.param('id'), 'ticket id'));
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

/** The ticket, its pull request (or a slice's, `?pr=`) and the credentials to read it. */
export function load(db: Db, ci: CiGitHub, c: Context): Loaded {
  const ticket = loadTicket(db, c);
  const number = pickedPullRequest(db, ticket, c);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  const auth = project ? projectGitHubAuth(db, project, process.env.GITHUB_TOKEN) : null;
  if (!project || !auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  const repo = { owner: project.owner, repo: project.repo };
  return { ticket, number, source: { ci, auth, repo } };
}

function statusOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
}

/** GitHub's 403 names no permission: say which ones the checks need. */
export function readGitHub<T>(work: () => Promise<T>): Promise<T> {
  return guarded(async () => {
    try {
      return await work();
    } catch (error) {
      if (statusOf(error) === FORBIDDEN) {
        throw fail(
          BAD_GATEWAY,
          'GitHub refused to read the checks: the GitHub App needs read access to Checks, Commit statuses and Actions (accepted on its installation), a classic token the repo scope',
        );
      }
      throw error;
    }
  });
}

export async function listing(loaded: Loaded): Promise<PullRequestChecks> {
  const { source, number } = loaded;
  const found = await readGitHub(() => source.ci.listChecks(source.auth, source.repo, number));
  if (!found) {
    throw fail(
      NOT_FOUND,
      `${source.repo.owner}/${source.repo.repo} has no pull request #${number}`,
    );
  }
  return found;
}
