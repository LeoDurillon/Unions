// The Pull requests tab's list: stacks first, then the other pull requests, and adding them to the current reviews.
import type { ReactElement } from 'react';

import type { PullRequestListItem } from '../../../src/api-types';
import { reviewStackBottoms, splitStacks } from '../../lib/pull-request-stacks';
import { useCurrentReviewMutations, useCurrentReviews } from '../../lib/use-current-reviews';
import { ErrorText } from '../ui';
import { Part } from './list-part';
import { PullRequestItem } from './pull-request-item';
import { StackItem } from './stack-item';

/** What the rows need from the current reviews: who is in, which stack one would join, adding. */
function useRowActions(projectId: number): {
  inReview: Set<number>;
  joinsOf: (pull: PullRequestListItem) => number | null;
  addOne: (pull: PullRequestListItem) => void;
  addStack: ReturnType<typeof useCurrentReviewMutations>['addStack'];
  error: Error | null;
} {
  const reviews = useCurrentReviews(projectId);
  const { add, addStack } = useCurrentReviewMutations(projectId);
  const inReview = new Set(reviews.data?.map((review) => review.prNumber));
  const bottoms = reviewStackBottoms(reviews.data ?? []);
  return {
    inReview,
    joinsOf: (pull) =>
      pull.ticketId === null && !inReview.has(pull.number)
        ? (bottoms.get(pull.baseBranch) ?? null)
        : null,
    addOne: (pull) => {
      add.mutate(pull);
    },
    addStack,
    error: add.error ?? addStack.error,
  };
}

/**
 * The pull requests as listed; when `grouped`, stacks come first in their own part, apart from the
 * others. Linked ones open their ticket.
 */
export function PullRequestRows({
  projectId,
  pulls,
  grouped,
  onOpenTicket,
}: {
  projectId: number;
  pulls: PullRequestListItem[];
  grouped: boolean;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const { inReview, joinsOf, addOne, addStack, error } = useRowActions(projectId);
  const { stacks, singles } = splitStacks(pulls, grouped);
  const rows = singles.map((pull) => (
    <PullRequestItem
      key={pull.number}
      pull={pull}
      inReview={inReview.has(pull.number)}
      joins={joinsOf(pull)}
      onOpenTicket={onOpenTicket}
      onAddReview={() => {
        addOne(pull);
      }}
    />
  ));
  return (
    <>
      <div className="px-4">
        <ErrorText error={error} />
      </div>
      {stacks.length > 0 ? (
        <div className="mb-6">
          <Part title="Stacks" count={stacks.length}>
            {stacks.map((stack) => (
              <StackItem
                key={stack[0]?.number}
                pulls={stack}
                inReview={inReview}
                joinsOf={joinsOf}
                adding={addStack.isPending}
                onOpenTicket={onOpenTicket}
                onAddReview={addOne}
                onAddStack={(members) => {
                  addStack.mutate(members);
                }}
              />
            ))}
          </Part>
        </div>
      ) : null}
      {stacks.length > 0 && singles.length > 0 ? (
        <Part title="Pull requests" count={singles.length}>
          {rows}
        </Part>
      ) : (
        <ul>{rows}</ul>
      )}
    </>
  );
}
