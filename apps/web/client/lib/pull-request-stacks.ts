// Stacks in the Pull requests tab and its Under review part, by GitHub's stacks, and the stack under review a pull request would join.
import type { GitHubStack } from '@union/core/github-stacks';
import { placedStacks, pullRequestStacks, type StackPlace } from '@union/core/pr-stacks';

import type { CurrentReview, PullRequestListItem } from '../../src/api-types';

/** A stack's listed pull requests, bottom first, and GitHub's stack (null: chained by branch). */
export type StackRow = { pulls: PullRequestListItem[]; github: GitHubStack | null };

/** The list split in two: its stacks (two or more pull requests each on GitHub), and the rest. */
export type SplitList = { stacks: StackRow[]; singles: PullRequestListItem[] };

function isStack(row: StackRow): boolean {
  return (row.github?.pullRequests.length ?? 0) > 1;
}

function byGitHub(pulls: PullRequestListItem[], stacks: GitHubStack[]): SplitList {
  const byNumber = new Map(stacks.map((stack) => [stack.number, stack]));
  const rows = placedStacks(pulls, (pull) => pull.stack).map((members) => ({
    pulls: members,
    github: byNumber.get(members[0]?.stack?.number ?? -1) ?? null,
  }));
  return {
    stacks: rows.filter((row) => isStack(row)),
    singles: rows.filter((row) => !isStack(row)).flatMap((row) => row.pulls),
  };
}

/**
 * The pull requests split by GitHub's stacks, in every list. Where GitHub has no stacks (`stacks`
 * null), open ones chain by branch and other lists stay flat (a merged member breaks the chain).
 */
export function splitStacks(
  pulls: PullRequestListItem[],
  stacks: GitHubStack[] | null,
  open: boolean,
): SplitList {
  if (stacks !== null) {
    return byGitHub(pulls, stacks);
  }
  if (!open) {
    return { stacks: [], singles: pulls };
  }
  const all = pullRequestStacks(pulls);
  return {
    stacks: all
      .filter((stack) => stack.length > 1)
      .map((stack) => ({ pulls: stack, github: null })),
    singles: all.filter((stack) => stack.length === 1).flat(),
  };
}

function placeOf(review: CurrentReview): StackPlace | null {
  return review.githubStackNumber === null || review.stackPosition === null
    ? null
    : { number: review.githubStackNumber, position: review.stackPosition };
}

/** The current reviews grouped by GitHub stack, bottom first, as last read. */
export function reviewStacks(reviews: CurrentReview[]): CurrentReview[][] {
  return placedStacks(reviews, placeOf);
}

/** For each GitHub stack under review, its bottom pull request there. */
export function reviewStackBottoms(reviews: CurrentReview[]): Map<number, number> {
  const bottoms = new Map<number, number>();
  for (const [bottom] of reviewStacks(reviews)) {
    if (bottom?.githubStackNumber !== null && bottom?.githubStackNumber !== undefined) {
      bottoms.set(bottom.githubStackNumber, bottom.prNumber);
    }
  }
  return bottoms;
}

/** The pull requests of the stack GitHub has that the list does not show (merged, or older). */
export function unlistedMembers(row: StackRow): GitHubStack['pullRequests'] {
  const listed = new Set(row.pulls.map((pull) => pull.number));
  return (row.github?.pullRequests ?? []).filter((pull) => !listed.has(pull.number));
}

/** Pull requests of a stack the stack's Add puts under review: not linked to a ticket, not in already. */
export function addableMembers(
  pulls: PullRequestListItem[],
  inReview: Set<number>,
): PullRequestListItem[] {
  return pulls.filter((pull) => pull.ticketId === null && !inReview.has(pull.number));
}
