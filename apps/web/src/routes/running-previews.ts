// `/api/previews`: every preview holding containers, whatever its project, and stopping one (the worker does).
import {
  activePreviews,
  getTicket,
  previewOwner,
  schema,
  type Db,
  type Preview,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, fail, NOT_FOUND, requireId } from '../http';
import type { RunningPreview, RunningPreviewOwner } from '../running-previews-types';
import { queuePreviewCommand, stopRefusal } from './preview-subject';

function ownerOf(db: Db, preview: Preview): RunningPreviewOwner | null {
  const owner = previewOwner(preview);
  if ('ticketId' in owner) {
    return { kind: 'ticket', ticketId: owner.ticketId, title: getTicket(db, owner.ticketId).title };
  }
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, owner.reviewId))
    .get();
  return review
    ? {
        kind: 'pull-request',
        reviewId: review.id,
        number: review.prNumber,
        title: review.title,
        url: review.url,
      }
    : null;
}

/** Starting, running or stopping: what holds containers, and counts against the cap. */
function runningPreviews(db: Db): RunningPreview[] {
  const projects = new Map(
    db
      .select()
      .from(schema.projects)
      .all()
      .map((project) => [project.id, project]),
  );
  return activePreviews(db).flatMap((preview) => {
    const owner = ownerOf(db, preview);
    const project = projects.get(preview.projectId);
    if (!owner || !project) {
      return [];
    }
    const { id, status, urls, url, startedAt } = preview;
    return [
      {
        id,
        status,
        urls,
        url,
        startedAt,
        owner,
        project: { id: project.id, owner: project.owner, repo: project.repo },
        stopRefusal:
          status === 'running' ? stopRefusal(db, previewOwner(preview)) : 'It is not running.',
      },
    ];
  });
}

function stop(db: Db, c: Context): Response {
  const id = requireId(c.req.param('id'), 'preview id');
  const preview = activePreviews(db).find((row) => row.id === id);
  if (!preview) {
    throw fail(NOT_FOUND, 'That preview is not running');
  }
  const owner = previewOwner(preview);
  const refusal = preview.status === 'running' ? stopRefusal(db, owner) : 'It is not running.';
  if (refusal !== null) {
    throw fail(CONFLICT, refusal);
  }
  queuePreviewCommand(db, owner, 'preview_stop');
  return c.json(runningPreviews(db), ACCEPTED);
}

/** Under `/api/previews`. */
export function runningPreviewRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(runningPreviews(db)));
  routes.post('/:id/stop', (c) => stop(db, c));
  return routes;
}
