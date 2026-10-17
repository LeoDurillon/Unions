import { schema, type Db, type NotionApi } from '@union/core';
import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import {
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
  requireText,
} from '../http';
import { pullRequestGroupingRoutes } from './grouping-targets';
import { prCommitRoutes } from './pr-commits';
import { prReviewRoutes } from './pr-review';

/** Everything but the files, which only the review page needs. */
const { files: _files, ...LISTED } = getTableColumns(schema.currentReviews);

function projectOf(db: Db, c: Context): number {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, `Project ${id} not found`);
  }
  return id;
}

/** The most a stack adds at once: the Pull requests tab lists 100. */
const MAX_STACK = 100;

type NewReview = typeof schema.currentReviews.$inferInsert;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A pull request as the client listed it, as a row to insert. */
function reviewValues(projectId: number, body: Record<string, unknown>): NewReview {
  return {
    projectId,
    prNumber: requireId(String(body.number), 'pull request number'),
    title: requireText(body, 'title'),
    url: requireText(body, 'url'),
    author: requireText(body, 'author'),
    headBranch: requireText(body, 'headBranch'),
    baseBranch: requireText(body, 'baseBranch'),
  };
}

/** Adds a pull request from the Pull requests tab; the client sends what it listed. */
async function add(db: Db, c: Context): Promise<Response> {
  const projectId = projectOf(db, c);
  const values = reviewValues(projectId, await readObject(c.req.raw));
  const [row] = db
    .insert(schema.currentReviews)
    .values(values)
    .onConflictDoNothing()
    .returning()
    .all();
  if (!row) {
    throw fail(CONFLICT, `#${values.prNumber} is already among the current reviews`);
  }
  return c.json(row, CREATED);
}

/**
 * Adds a stack's pull requests at once, so it is never half added. Those already under review are
 * skipped: the answer lists only the added ones.
 */
async function addStack(db: Db, c: Context): Promise<Response> {
  const projectId = projectOf(db, c);
  const { pullRequests } = await readObject(c.req.raw);
  if (!Array.isArray(pullRequests) || pullRequests.length === 0) {
    throw fail(BAD_REQUEST, 'Expected a non-empty pullRequests list');
  }
  if (pullRequests.length > MAX_STACK) {
    throw fail(BAD_REQUEST, `A stack adds at most ${MAX_STACK} pull requests`);
  }
  const rows = pullRequests.map((pull: unknown) => {
    if (!isRecord(pull)) {
      throw fail(BAD_REQUEST, 'Each pull request must be an object');
    }
    return reviewValues(projectId, pull);
  });
  const added = db.transaction((tx) =>
    tx.insert(schema.currentReviews).values(rows).onConflictDoNothing().returning().all(),
  );
  return c.json(added, CREATED);
}

function remove(db: Db, c: Context): Response {
  const projectId = projectOf(db, c);
  const prNumber = requireId(c.req.param('number'), 'pull request number');
  const [removed] = db
    .delete(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, projectId),
        eq(schema.currentReviews.prNumber, prNumber),
      ),
    )
    .returning()
    .all();
  if (!removed) {
    throw fail(NOT_FOUND, `#${prNumber} is not among the current reviews`);
  }
  return c.json({ number: prNumber });
}

/** `/api/projects/:projectId/pull-requests/reviews`: pull requests the user reviews without a ticket. */
export function currentReviewRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/', (c) =>
    c.json(
      db
        .select(LISTED)
        .from(schema.currentReviews)
        .where(eq(schema.currentReviews.projectId, projectOf(db, c)))
        .orderBy(desc(schema.currentReviews.id))
        .all(),
    ),
  );
  routes.post('/', (c) => add(db, c));
  routes.post('/stack', (c) => addStack(db, c));
  routes.delete('/:number', (c) => remove(db, c));
  routes.route('/:number/groupings', pullRequestGroupingRoutes(db, github, notion));
  routes.route('/:number/commits', prCommitRoutes(db, github));
  routes.route('/:number', prReviewRoutes(db, github));
  return routes;
}
