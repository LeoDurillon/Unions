// Which tickets the board shows: a text search (title, issue or PR number), only those that need the
// user, and where they came from.
import type { TicketSummary } from '../../src/api-types';

/** `github`: imported from a GitHub issue or written in Union (both have an issue); `notion`: imported from Notion. */
export type OriginFilter = 'all' | 'notion' | 'github';

export type BoardFilter = { text: string; needsYou: boolean; origin: OriginFilter };

export const NO_FILTER: BoardFilter = { text: '', needsYou: false, origin: 'all' };

type Filterable = Pick<
  TicketSummary,
  'title' | 'issueNumber' | 'prNumber' | 'phase' | 'prState' | 'prChecksState' | 'originKind'
>;

/** It waits on the user: a step to approve, a failure or a refused commit, red CI checks. */
export function needsYou(ticket: Filterable): boolean {
  const { kind } = ticket.phase;
  if (kind === 'awaiting_approval' || kind === 'failed' || kind === 'commit_refused') {
    return true;
  }
  return ticket.prState === 'open' && ticket.prChecksState === 'failure';
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
  return origin === 'notion' ? ticket.originKind === 'notion' : ticket.originKind !== 'notion';
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
