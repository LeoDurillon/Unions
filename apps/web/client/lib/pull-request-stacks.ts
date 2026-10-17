// Stacks in the Pull requests and Current reviews tabs, and the stack under review a pull request would join.
import { pullRequestStacks } from '@union/core/pr-stacks';

import type { CurrentReview, PullRequestListItem } from '../../src/api-types';

/** The list split in two: its stacks (two or more pull requests each, bottom first), and the rest. */
export type SplitList = { stacks: PullRequestListItem[][]; singles: PullRequestListItem[] };

/** Open pull requests split by stack; other lists stay flat (a merged member breaks the chain). */
export function splitStacks(pulls: PullRequestListItem[], grouped: boolean): SplitList {
  if (!grouped) {
    return { stacks: [], singles: pulls };
  }
  const all = pullRequestStacks(pulls);
  return {
    stacks: all.filter((stack) => stack.length > 1),
    singles: all.filter((stack) => stack.length === 1).flat(),
  };
}

/** The current reviews grouped by stack, bottom first, by their branches as last read. */
export function reviewStacks(reviews: CurrentReview[]): CurrentReview[][] {
  const members = reviews.map((review) => ({
    review,
    number: review.prNumber,
    headBranch: review.headBranch,
    baseBranch: review.baseBranch,
  }));
  return pullRequestStacks(members).map((stack) => stack.map((member) => member.review));
}

/** For each head branch under review, the bottom pull request of its stack there. */
export function reviewStackBottoms(reviews: CurrentReview[]): Map<string, number> {
  const bottoms = new Map<string, number>();
  for (const stack of reviewStacks(reviews)) {
    const [bottom] = stack;
    for (const member of stack) {
      if (bottom) {
        bottoms.set(member.headBranch, bottom.prNumber);
      }
    }
  }
  return bottoms;
}

/** Pull requests of a stack the stack's Add puts under review: not linked to a ticket, not in already. */
export function addableMembers(
  pulls: PullRequestListItem[],
  inReview: Set<number>,
): PullRequestListItem[] {
  return pulls.filter((pull) => pull.ticketId === null && !inReview.has(pull.number));
}
