// The trackers' failures as HTTP answers: a refusal, a value or item refused, the tracker's own status.
import {
  ItemOutsideSourceError,
  JiraError,
  NotionError,
  TrackerRefusedError,
  TrackerValueError,
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
