// `<review>/runs`: commands the user runs in a pull request's own checkout, and their output added to the review.
import {
  getContainerRun,
  listContainerRuns,
  schema,
  type ContainerRun,
  type Db,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireId } from '../http';
import { addGeneralDraft, outputComment } from '../review-output-comment';
import type { ReviewRunsView } from '../review-preview-types';
import { load, type Review } from './pr-review-load';
import { queueFromBody } from './run-input';

function view(db: Db, review: Review): ReviewRunsView {
  return {
    runs: listContainerRuns(db, { reviewId: review.id }),
    refusal: review.headSha
      ? null
      : "Open the pull request's review first: its files are not read yet",
  };
}

function loadRun(db: Db, c: Context, review: Review): ContainerRun {
  const row = getContainerRun(db, requireId(c.req.param('runId'), 'run id'));
  if (row?.reviewId !== review.id) {
    throw fail(NOT_FOUND, 'Run not found');
  }
  return row;
}

async function run(db: Db, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const { refusal } = view(db, review);
  if (refusal !== null) {
    throw fail(CONFLICT, refusal);
  }
  queueFromBody(db, { reviewId: review.id }, project.config, await readObject(c.req.raw));
  return c.json(view(db, review), CREATED);
}

function cancel(db: Db, c: Context): Response {
  const { review } = load(db, c);
  const row = loadRun(db, c, review);
  if (row.status !== 'queued' && row.status !== 'running') {
    throw fail(CONFLICT, 'The command is not running');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_container_run', payload: { containerRunId: row.id } })
    .run();
  return c.json(view(db, review), ACCEPTED);
}

/** A finished run's output as a draft comment on the review, for the user to edit before sending. */
function addToReview(db: Db, c: Context): Response {
  const { review } = load(db, c);
  const row = loadRun(db, c, review);
  if (row.status === 'queued' || row.status === 'running') {
    throw fail(CONFLICT, 'The command has not finished yet');
  }
  return c.json(addGeneralDraft(db, review, outputComment(row)), CREATED);
}

/**
 * `/api/projects/:projectId/pull-requests/reviews/:number/runs`: commands the user runs in the pull
 * request's checkout (the worker runs them), with the end of their output.
 */
export function reviewRunRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, load(db, c).review)));
  routes.post('/', (c) => run(db, c));
  routes.post('/:runId/cancel', (c) => cancel(db, c));
  routes.post('/:runId/review', (c) => addToReview(db, c));
  return routes;
}
