// Sets one property of a Notion page, typed by hand in a tracker tab, and logs how it went.
import {
  emitEvent,
  integrationOf,
  NotionError,
  notionHandValue,
  type Db,
  type NotionApi,
  type TrackerFieldSet,
} from '@union/core';

const FORBIDDEN = 403;

/** Notion's reason, with the capability named when it refused one. */
function reasonOf(error: unknown): string {
  if (error instanceof NotionError && error.status === FORBIDDEN) {
    return 'Notion refused it: in the integration’s settings, Capabilities, turn on “Update content”';
  }
  return error instanceof Error ? error.message : String(error);
}

/** Null when Notion has the value now, else why not. */
async function attempt(db: Db, notion: NotionApi, change: TrackerFieldSet): Promise<string | null> {
  const integration = integrationOf(db, change.projectId, 'notion');
  if (!integration) {
    return 'This project is not connected to Notion';
  }
  const shaped = notionHandValue(change.field, change.value);
  if ('error' in shaped) {
    return shaped.error;
  }
  try {
    await notion.updatePage(integration.secret, change.itemId, { [change.field.id]: shaped.value });
    return null;
  } catch (error) {
    return reasonOf(error);
  }
}

/**
 * Sets the property of the `set_tracker_fields` command `commandId` with the project's Notion
 * secret; `tracker_field_set` or `tracker_field_failed` on the ticket says how it went.
 */
export async function setNotionField(
  db: Db,
  notion: NotionApi,
  commandId: number,
  change: TrackerFieldSet,
): Promise<void> {
  const error = await attempt(db, notion, change);
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
