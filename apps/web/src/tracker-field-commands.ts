// Properties of a tracker's item set by hand, as the web hands them to the worker: one queued, and those not sent yet.
import {
  notionSchemaOf,
  SET_TRACKER_FIELDS,
  schema,
  trackerFieldSetOf,
  type Db,
  type TrackerFieldSet,
  type TrackerProperty,
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

/** The ticket's changes the worker has not sent yet ("Saving…" in the tab, across reloads). */
export function pendingTrackerFields(
  db: Db,
  ticketId: number,
  now = Date.now(),
): PendingTrackerField[] {
  return pendingComments(db, ticketId, TRACKER_FIELDS, now).map(
    ({ commandId, createdAt, post }) => ({
      commandId,
      fieldId: post.field.id,
      text: post.text,
      createdAt,
    }),
  );
}

/** A Notion page's properties with their options, which the page does not give: the data source's columns'. */
export function withNotionOptions(
  db: Db,
  projectId: number,
  properties: TrackerProperty[],
): TrackerProperty[] {
  const columns = notionSchemaOf(db, projectId)?.properties ?? [];
  return properties.map((property) => ({
    ...property,
    options: columns.find((column) => column.id === property.id)?.options ?? property.options,
  }));
}
