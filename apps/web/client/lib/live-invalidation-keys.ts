// Which cached queries an event makes stale: board, ticket, investigations, notifications, the
// review page's side runs.

import type { InvalidateQueryFilters, QueryKey } from '@tanstack/react-query';

import type { EventRow } from '../../src/api-types';
import { NOTIFICATIONS_KEY } from './notifications-api';
import { ticketReviewBase } from './review/review-target';

/** Events read straight from the stream and changing no query: a preview build prints thousands of lines. */
const STREAM_ONLY = new Set(['preview_output']);

/** Each review side run's event, and the part of a review's queries it changes (`['review', base, part]`). */
const REVIEW_RUN_PARTS: Record<string, string> = {
  agent_review_changed: 'agent-review',
  review_grouping_changed: 'grouping',
  review_report_changed: 'report',
  review_explanation_changed: 'explanations',
  review_agent_run_changed: 'review-agents',
};

/**
 * The part of the review page a side run's event changes, or null. A pull request's events carry its
 * review id, not the project and number its queries are keyed by: the part is matched in every
 * review open, which only refetches the few queries shown.
 */
function reviewRunPart(event: EventRow): string | null {
  return REVIEW_RUN_PARTS[event.type] ?? null;
}

/** The review queries a side run's event changes, in every review open; null for any other event. */
export function reviewRunFilter(event: EventRow): InvalidateQueryFilters | null {
  const part = reviewRunPart(event);
  return part === null
    ? null
    : { predicate: (query) => query.queryKey[0] === 'review' && query.queryKey[2] === part };
}

/** The query keys to refetch after `event` (a review side run's: `reviewRunPart`). */
export function invalidationKeys(event: EventRow): QueryKey[] {
  if (STREAM_ONLY.has(event.type) || reviewRunPart(event) !== null) {
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
  // The projects list carries each project's counts (needs you, running) for the sidebar.
  return [
    ['tickets'],
    ['projects'],
    ['ticket', event.ticketId],
    ['review', ticketReviewBase(event.ticketId)],
  ];
}
