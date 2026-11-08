// Which cached queries an event makes stale: the board, a ticket, investigations, notifications.
import type { QueryKey } from '@tanstack/react-query';

import type { EventRow } from '../../src/api-types';
import { NOTIFICATIONS_KEY } from './notifications-api';
import { ticketReviewBase } from './review-target';

/** Events read straight from the stream and changing no query: a preview build prints thousands of lines. */
const STREAM_ONLY = new Set(['preview_output']);

/** The query keys to refetch after `event`. */
export function invalidationKeys(event: EventRow): QueryKey[] {
  if (STREAM_ONLY.has(event.type)) {
    return [];
  }
  if (event.type === 'notification_created') {
    return [NOTIFICATIONS_KEY];
  }
  if (event.type === 'custom_agent_prompt_ready' || event.type === 'custom_agent_prompt_failed') {
    return [['agents']];
  }
  if (event.investigationId !== null) {
    return [['investigations']];
  }
  if (event.ticketId === null) {
    return [['tickets']];
  }
  return [['tickets'], ['ticket', event.ticketId], ['review', ticketReviewBase(event.ticketId)]];
}
