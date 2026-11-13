// Properties of a tracker's item set by hand, as the web hands them to the worker: one queued, and those not sent yet.
import {
  SET_TRACKER_FIELDS,
  schema,
  trackerFieldSetOf,
  type Db,
  type TrackerFieldSet,
} from '@union/core';

import { pendingComments, type CommentCommand } from './pending-comments';
import type { PendingTrackerField } from './tracker-field-types';

/** Queues the change for the worker; the payload is checked as the worker reads it. */
export function queueTrackerField(db: Db, change: TrackerFieldSet): number {
  const payload = trackerFieldSetOf(change);
  return db
    .insert(schema.commands)
    .values({ type: SET_TRACKER_FIELDS, ticketId: payload.ticketId, payload })
    .returning()
    .get().id;
}

const TRACKER_FIELDS = {
  type: SET_TRACKER_FIELDS,
  answers: ['tracker_field_set', 'tracker_field_failed'],
  parse: trackerFieldSetOf,
} as const satisfies CommentCommand<TrackerFieldSet>;

type Pending = ReturnType<typeof pendingComments<TrackerFieldSet>>[number];

function pendingOf({ commandId, createdAt, post }: Pending): PendingTrackerField {
  return { commandId, fieldId: post.field.id, text: post.text, createdAt };
}

/** The ticket's changes the worker has not sent yet ("Saving…" in the tab, across reloads). */
export function pendingTrackerFields(
  db: Db,
  ticketId: number,
  now = Date.now(),
): PendingTrackerField[] {
  return pendingComments(db, ticketId, TRACKER_FIELDS, now).map((pending) => pendingOf(pending));
}

/** The changes made from a review's tab to one of its linked items, not sent yet. */
export function pendingReviewFields(
  db: Db,
  reviewId: number,
  itemId: string,
  now = Date.now(),
): PendingTrackerField[] {
  return pendingComments(db, null, TRACKER_FIELDS, now)
    .filter(({ post }) => post.reviewId === reviewId && post.itemId === itemId)
    .map((pending) => pendingOf(pending));
}
