// `/api/tickets/:id/trackers/:kind/comments`: the comments of the ticket's tracker item, read now through its
// adapter. Also those the user sends to it, posted by the worker, and Add to review.

import { trackerAdapter, type Db, type IntegrationApis, type TrackerThreads } from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, fail, NOT_FOUND, readObject } from '../http';
import { reviewImportRefusal } from '../review-import-refusal';
import { loadTicketTrackerItem, type TicketTrackerItem } from '../ticket-tracker-item';
import { pendingTrackerComments, queueTrackerComment } from '../tracker-comment-commands';
import type { TrackerCommentsView } from '../tracker-comment-types';
import { importedThreads, importThread } from '../tracker-review-import';
import { guarded } from './notion';

type Loaded = TicketTrackerItem & { read: () => Promise<TrackerThreads> };

/** The ticket's item, and how to read its threads; refused for a tracker without comments. */
function load(db: Db, apis: IntegrationApis, c: Context): Loaded {
  const loaded = loadTicketTrackerItem(db, c);
  const { comments } = trackerAdapter(loaded.kind, apis);
  if (!comments) {
    throw fail(NOT_FOUND, 'Union does not read comments from this tracker');
  }
  const { secret, config } = loaded.integration;
  return {
    ...loaded,
    read: () => guarded(() => comments.read(secret, config, loaded.item.id)),
  };
}

async function view(db: Db, loaded: Loaded): Promise<TrackerCommentsView> {
  const { ticket, kind } = loaded;
  const threads = await loaded.read();
  return {
    ...threads,
    kind,
    pending: pendingTrackerComments(db, ticket.id, kind),
    review: {
      importedIds: importedThreads(db, ticket.id, threads.threads),
      refusal: reviewImportRefusal(ticket),
    },
  };
}

/** Reads the thread again (as it is now, replies included), then adds it or its one comment to the review. */
async function addToReview(db: Db, loaded: Loaded, c: Context): Promise<Response> {
  const refusal = reviewImportRefusal(loaded.ticket);
  if (refusal !== null) {
    throw fail(CONFLICT, refusal);
  }
  const { threadId, commentId } = await readObject(c.req.raw);
  const { threads } = await loaded.read();
  const thread = threads.find((one) => one.id === threadId);
  if (!thread) {
    throw fail(NOT_FOUND, 'This comment is not open on the item any more');
  }
  const one = typeof commentId === 'string' ? commentId : null;
  if (one !== null && !thread.comments.some((comment) => comment.id === one)) {
    throw fail(NOT_FOUND, 'This comment is not on the item any more');
  }
  return c.json({
    imported: importThread(db, loaded.ticket, loaded.kind, { thread, commentId: one }),
  });
}

/**
 * `GET` reads the threads on each call (the tab reads once per opening, and on Refresh), with the
 * comments not posted yet and those in the review. `POST` (`{ threadId?, mention?, text }`) queues a
 * reply or a new comment; `POST /import` (`{ threadId, commentId? }`) adds a thread, or one of its
 * comments, to the review.
 */
export function ticketTrackerCommentRoutes(db: Db, apis: IntegrationApis): Hono {
  const routes = new Hono();
  const path = '/:id/trackers/:kind/comments';
  routes.get(path, async (c) => c.json(await view(db, load(db, apis, c))));
  routes.post(`${path}/import`, (c) => addToReview(db, load(db, apis, c), c));
  routes.post(path, async (c) => {
    const { ticket, kind, item } = load(db, apis, c);
    const input = await readObject(c.req.raw);
    const id = queueTrackerComment(db, ticket, { kind, id: item.id }, input);
    return c.json({ id }, ACCEPTED);
  });
  return routes;
}
