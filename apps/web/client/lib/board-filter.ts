// Which tickets the board shows: a text search (title, issue or PR number) and where they came
// from. A filter also shows only those that need the user.
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import { needsYou as waitsOnUser } from '@union/core/needs-you';

import type { TicketSummary } from '../../src/api-types';

/** `github`: imported from a GitHub issue or written in Union (both have an issue); a kind: imported from that tracker. */
export type OriginFilter = 'all' | 'github' | IntegrationKindName;

export type BoardFilter = { text: string; needsYou: boolean; origin: OriginFilter };

export const NO_FILTER: BoardFilter = { text: '', needsYou: false, origin: 'all' };

type Filterable = Pick<
  TicketSummary,
  'title' | 'issueNumber' | 'prNumber' | 'phase' | 'prState' | 'prChecksState' | 'originKind'
>;

/** It waits on the user (core's rule, shared with the sidebar's counts). */
export function needsYou(ticket: Filterable): boolean {
  return waitsOnUser(ticket);
}

function matchesText(ticket: Filterable, text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  const haystack = [
    ticket.title,
    ticket.issueNumber === null ? '' : `#${ticket.issueNumber}`,
    ticket.prNumber === null ? '' : `#${ticket.prNumber}`,
  ]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function matchesOrigin(ticket: Filterable, origin: OriginFilter): boolean {
  if (origin === 'all') {
    return true;
  }
  return origin === 'github' ? ticket.originKind === null : ticket.originKind === origin;
}

/** The origin filter's choices: one per tracker some ticket came from; none when no ticket did. */
export function originOptions(
  tickets: Pick<TicketSummary, 'originKind'>[],
): { value: OriginFilter; label: string }[] {
  const kinds = [
    ...new Set(tickets.flatMap((ticket) => (ticket.originKind ? [ticket.originKind] : []))),
  ].toSorted();
  if (kinds.length === 0) {
    return [];
  }
  return [
    { value: 'all', label: 'All' },
    ...kinds.map((kind) => ({ value: kind, label: `From ${integrationKind(kind).label}` })),
    { value: 'github', label: 'From GitHub' },
  ];
}

/** The tickets the filter keeps, in their order. */
export function filterTickets<T extends Filterable>(tickets: T[], filter: BoardFilter): T[] {
  return tickets.filter(
    (ticket) =>
      matchesText(ticket, filter.text) &&
      (!filter.needsYou || needsYou(ticket)) &&
      matchesOrigin(ticket, filter.origin),
  );
}

/** The filter narrows the board. */
export function isFiltering(filter: BoardFilter): boolean {
  return filter.text.trim() !== '' || filter.needsYou || filter.origin !== 'all';
}
