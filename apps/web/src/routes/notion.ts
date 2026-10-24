// What the routes reading Notion share: its errors as HTTP answers, page IDs, the project's secret.
import {
  integrationKind,
  integrationOf,
  ItemOutsideSourceError,
  NotionError,
  type Db,
} from '@union/core';
import { HTTPException } from 'hono/http-exception';

import {
  BAD_GATEWAY,
  BAD_REQUEST,
  CONFLICT,
  fail,
  NOT_FOUND,
  requireText,
  UNAUTHORIZED,
} from '../http';

/** Notion failures become messages the UI shows next to the field. */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    if (error instanceof NotionError && error.status === UNAUTHORIZED) {
      throw fail(UNAUTHORIZED, error.message);
    }
    if (error instanceof NotionError && error.status === NOT_FOUND) {
      throw fail(NOT_FOUND, error.message);
    }
    if (error instanceof ItemOutsideSourceError) {
      throw fail(CONFLICT, error.message);
    }
    throw fail(BAD_GATEWAY, error instanceof Error ? error.message : 'Notion request failed');
  }
}

export function requireNotionId(body: Record<string, unknown>, key: string, label: string): string {
  const id = integrationKind('notion').parseRef(requireText(body, key));
  if (!id) {
    throw fail(BAD_REQUEST, `That is not a Notion ${label} ID or URL`);
  }
  return id;
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
