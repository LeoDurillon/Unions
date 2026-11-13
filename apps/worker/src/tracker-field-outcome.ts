// Logs how setting a tracker item's property by hand went: `tracker_field_set`, or `tracker_field_failed` with why.
import { emitEvent, type Db, type TrackerFieldSet } from '@union/core';

/** `error` null: the tracker has the value now. */
export function logFieldOutcome(
  db: Db,
  commandId: number,
  change: TrackerFieldSet,
  error: string | null,
): void {
  const outcome = {
    commandId,
    kind: change.kind,
    itemId: change.itemId,
    reviewId: change.reviewId,
    fieldId: change.field.id,
    fieldName: change.field.name,
    text: change.text,
  };
  // A review's change has no ticket: the event is the project's then, the review in its payload.
  const ticket = change.ticketId === null ? {} : { ticketId: change.ticketId };
  emitEvent(
    db,
    error === null
      ? { type: 'tracker_field_set', ...ticket, payload: outcome }
      : { type: 'tracker_field_failed', ...ticket, payload: { ...outcome, error } },
  );
}
