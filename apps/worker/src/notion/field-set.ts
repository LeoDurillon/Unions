// Sets one property of a Notion page, typed by hand in a tracker tab, and logs how it went.
import {
  integrationOf,
  NotionError,
  notionHandValue,
  type Db,
  type NotionApi,
  type TrackerFieldSet,
} from '@union/core';

import { logFieldOutcome } from '../tracker-field-outcome';

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
  logFieldOutcome(db, commandId, change, await attempt(db, notion, change));
}
