// `/api/projects/:projectId/pull-requests/reviews`: pull requests the user reviews without a
// ticket.
import { schema, type Db, type NotionApi } from '@union/core';
import { and, eq, inArray } from 'drizzle-orm';
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
import { listedReviews } from './current-review-list';
import {
  pullRequestExplanationRoutes,
  pullRequestGroupingRoutes,
  pullRequestReportRoutes,
  pullRequestSpecRoutes,
} from './grouping-targets';
import { prReviewRoutes } from './pr-review';
import { forgetReviews, removeReviewFiles } from './review-removal';
import { reviewWorkspaceRoutes } from './review-workspace';

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

/** The GitHub stack the client listed it in, if any: kept until the next read of the stacks. */
function stackValues(stack: unknown): Pick<NewReview, 'githubStackNumber' | 'stackPosition'> {
  if (
    isRecord(stack) &&
    typeof stack.number === 'number' &&
    typeof stack.position === 'number' &&
    Number.isSafeInteger(stack.number) &&
    Number.isSafeInteger(stack.position)
  ) {
    return { githubStackNumber: stack.number, stackPosition: stack.position };
  }
  return { githubStackNumber: null, stackPosition: null };
}

/** A pull request as the client listed it, as a row to insert. */
function reviewValues(projectId: number, body: Record<string, unknown>): NewReview {
  return {
    ...stackValues(body.stack),
    projectId,
    prNumber: requireId(String(body.number), 'pull request number'),
    title: requireText(body, 'title'),
    url: requireText(body, 'url'),
    author: requireText(body, 'author'),
    headBranch: requireText(body, 'headBranch'),
    baseBranch: requireText(body, 'baseBranch'),
    fromFork: body.crossRepository === true,
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

/** Removes a review, and what it holds (its container and volumes, through the worker; its files). */
async function remove(db: Db, c: Context): Promise<Response> {
  const projectId = projectOf(db, c);
  const prNumber = requireId(c.req.param('number'), 'pull request number');
  const removed = db.transaction((tx) => {
    const [row] = tx
      .delete(schema.currentReviews)
      .where(
        and(
          eq(schema.currentReviews.projectId, projectId),
          eq(schema.currentReviews.prNumber, prNumber),
        ),
      )
      .returning()
      .all();
    if (row) {
      forgetReviews(tx, [row.id]);
    }
    return row;
  });
  if (!removed) {
    throw fail(NOT_FOUND, `#${prNumber} is not among the current reviews`);
  }
  await removeReviewFiles([removed.id]);
  return c.json({ number: prNumber });
}

/** Removes a stack's reviews at once: all of them, or none when one is not under review. */
async function removeStack(db: Db, c: Context): Promise<Response> {
  const projectId = projectOf(db, c);
  const { numbers } = await readObject(c.req.raw);
  if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > MAX_STACK) {
    throw fail(BAD_REQUEST, `Expected a list of 1 to ${MAX_STACK} pull request numbers`);
  }
  const wanted = [
    ...new Set(numbers.map((number) => requireId(String(number), 'pull request number'))),
  ];
  const removed = db.transaction((tx) => {
    const rows = tx
      .delete(schema.currentReviews)
      .where(
        and(
          eq(schema.currentReviews.projectId, projectId),
          inArray(schema.currentReviews.prNumber, wanted),
        ),
      )
      .returning()
      .all();
    const found = new Set(rows.map((row) => row.prNumber));
    const missing = wanted.filter((number) => !found.has(number));
    if (missing.length > 0) {
      // Thrown inside the transaction: it rolls back, nothing is removed.
      throw fail(
        NOT_FOUND,
        `${missing.map((number) => `#${number}`).join(', ')} not among the current reviews`,
      );
    }
    forgetReviews(
      tx,
      rows.map((row) => row.id),
    );
    return rows;
  });
  await removeReviewFiles(removed.map((row) => row.id));
  return c.json({ numbers: removed.map((row) => row.prNumber) });
}

/** `/api/projects/:projectId/pull-requests/reviews`: pull requests the user reviews without a ticket. */
export function currentReviewRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listedReviews(db, projectOf(db, c))));
  routes.post('/', (c) => add(db, c));
  routes.post('/stack', (c) => addStack(db, c));
  routes.post('/stack/remove', (c) => removeStack(db, c));
  routes.delete('/:number', (c) => remove(db, c));
  routes.route('/:number/groupings', pullRequestGroupingRoutes(db, github, notion));
  routes.route('/:number/explanations', pullRequestExplanationRoutes(db));
  routes.route('/:number/specs', pullRequestSpecRoutes(db, github, notion));
  routes.route('/:number/reports', pullRequestReportRoutes(db, github, notion));
  routes.route('/:number', reviewWorkspaceRoutes(db, { github, notion }));
  routes.route('/:number', prReviewRoutes(db, github));
  return routes;
}
