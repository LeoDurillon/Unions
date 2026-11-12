// The Pull requests tab's own filters over the list GitHub gave. A search (title, #number, branch), only those
// with a ticket, and drafts hidden.
import type { PullRequestListItem } from '../../../src/api-types';

export type PullFilter = { text: string; withTicket: boolean; hideDrafts: boolean };

export const NO_PULL_FILTER: PullFilter = { text: '', withTicket: false, hideDrafts: false };

type Filterable = Pick<
  PullRequestListItem,
  'number' | 'title' | 'headBranch' | 'draft' | 'ticketId'
>;

function matches(pull: Filterable, words: string[]): boolean {
  const haystack = `${pull.title} #${pull.number} ${pull.headBranch}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The pull requests the filter keeps, in their order. */
export function filterPulls<T extends Filterable>(pulls: readonly T[], filter: PullFilter): T[] {
  const words = filter.text
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  return pulls.filter(
    (pull) =>
      matches(pull, words) &&
      (!filter.withTicket || pull.ticketId !== null) &&
      (!filter.hideDrafts || !pull.draft),
  );
}

export function isPullFiltering(filter: PullFilter): boolean {
  return filter.text.trim() !== '' || filter.withTicket || filter.hideDrafts;
}
