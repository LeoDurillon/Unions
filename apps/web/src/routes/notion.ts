// What the routes reading the trackers share: their errors as HTTP answers; Notion's secret for a project.
import {
  integrationOf,
  ItemOutsideSourceError,
  JiraError,
  NotionError,
  TrackerRefusedError,
  TrackerValueError,
  type Db,
} from '@union/core';
import { HTTPException } from 'hono/http-exception';

import { BAD_GATEWAY, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, UNAUTHORIZED } from '../http';

/** A tracker's own answer (bad secret, not found) kept as the status; anything else is the tracker failing. */
function trackerStatus(
  error: unknown,
):
  | typeof BAD_REQUEST
  | typeof CONFLICT
  | typeof UNAUTHORIZED
  | typeof NOT_FOUND
  | typeof BAD_GATEWAY {
  if (error instanceof ItemOutsideSourceError || error instanceof TrackerRefusedError) {
    return CONFLICT;
  }
  if (error instanceof TrackerValueError) {
    return error.gone ? NOT_FOUND : BAD_REQUEST;
  }
  const status = error instanceof NotionError || error instanceof JiraError ? error.status : null;
  if (status === UNAUTHORIZED || status === NOT_FOUND) {
    return status;
  }
  return BAD_GATEWAY;
}

/** Tracker (Notion, Jira) failures become messages the UI shows next to the field. */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'The tracker request failed';
    throw fail(trackerStatus(error), message);
  }
}

const NOT_CONNECTED = 'This project is not connected to Notion: set it up in the project settings';

/** The project's Notion secret, for reading any page shared with the integration. */
export function notionTokenOf(db: Db, projectId: number): string {
  const integration = integrationOf(db, projectId, 'notion');
  if (!integration) {
    throw fail(CONFLICT, NOT_CONNECTED);
  }
  return integration.secret;
}
