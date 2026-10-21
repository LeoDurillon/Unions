import { projectGitHubAuth, schema, type Db, type NotionApi } from '@union/core';
import { stackPlaces } from '@union/core/pr-stacks';
import { and, eq, isNotNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { PULL_REQUEST_FILTERS, type PullRequestFilter, type PullRequestList } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, requireId } from '../http';
import { currentReviewRoutes } from './current-reviews';
import { PullRequestCache } from './pull-request-cache';
import { readListing } from './pull-request-listing';

function filterOf(c: Context): PullRequestFilter {
  const value = c.req.query('state') ?? 'open';
  const filter = PULL_REQUEST_FILTERS.find((candidate) => candidate === value);
  if (!filter) {
    throw fail(BAD_REQUEST, `"state" must be one of ${PULL_REQUEST_FILTERS.join(', ')}`);
  }
  return filter;
}

/** Pull request number → ticket, for the project's tickets that have one linked, slices of a stack included. */
function ticketsByPullRequest(db: Db, projectId: number): Map<number, number> {
  const rows = db
    .select({ id: schema.tickets.id, prNumber: schema.tickets.prNumber })
    .from(schema.tickets)
    .where(and(eq(schema.tickets.projectId, projectId), isNotNull(schema.tickets.prNumber)))
    .all();
  const slices = db
    .select({ id: schema.ticketSlices.ticketId, prNumber: schema.ticketSlices.prNumber })
    .from(schema.ticketSlices)
    .innerJoin(schema.tickets, eq(schema.tickets.id, schema.ticketSlices.ticketId))
    .where(and(eq(schema.tickets.projectId, projectId), isNotNull(schema.ticketSlices.prNumber)))
    .all();
  return new Map(
    [...slices, ...rows].flatMap((row) => (row.prNumber === null ? [] : [[row.prNumber, row.id]])),
  );
}

async function list(
  db: Db,
  github: OnboardingGitHub,
  cache: PullRequestCache,
  c: Context,
): Promise<Response> {
  const id = requireId(c.req.param('projectId'), 'project id');
  const filter = filterOf(c);
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, `Project ${id} not found`);
  }
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  const cached = await cache.get(
    project.id,
    filter,
    () => readListing({ db, github }, project, auth, filter),
    c.req.query('refresh') !== undefined,
  );
  if (!cached) {
    throw fail(
      NOT_FOUND,
      `${project.owner}/${project.repo} is not reachable with these credentials`,
    );
  }
  const tickets = ticketsByPullRequest(db, project.id);
  const { found, fetchedAt } = cached;
  const places = stackPlaces(found.stacks ?? []);
  const body: PullRequestList = {
    total: found.total,
    // Set on the cached items too: harmless, every response sets it again from the tickets now.
    pullRequests: found.pullRequests.map((pull) =>
      Object.assign(pull, {
        ticketId: tickets.get(pull.number) ?? null,
        stack: places.get(pull.number) ?? null,
      }),
    ),
    stacks: found.stacks,
    fetchedAt,
  };
  return c.json(body);
}

/**
 * `/api/projects/:projectId/pull-requests`: the repository's pull requests and stacks, read from
 * GitHub (kept a few minutes; `?refresh` reads them again), and
 * under `/reviews` the ones the user put under review.
 */
export function pullRequestRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const routes = new Hono();
  const cache = new PullRequestCache();
  routes.get('/', (c) => list(db, github, cache, c));
  routes.route('/reviews', currentReviewRoutes(db, github, notion));
  return routes;
}
