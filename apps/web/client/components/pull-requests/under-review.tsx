// The Pull requests tab's "Under review" part: pull requests put under review without a ticket, stacks
// first; Open review opens the review page (a stack's with a tab per pull request).
import type { ReactElement } from 'react';

import type { CurrentReview, PublicProject } from '../../../src/api-types';
import { reviewStacks } from '../../lib/pull-request-stacks';
import { useReviewedPullRequest } from '../../lib/review-url';
import { useCurrentReviewMutations, useCurrentReviews } from '../../lib/use-current-reviews';
import { ErrorText } from '../ui';
import { Part } from './list-part';
import { ReviewItem } from './review-item';
import { ReviewStackItem } from './review-stack-item';
import { StackReview } from './stack-review';

/** The reviews, stacks first, in one part; `onOpen` opens a pull request. */
function ReviewRows({
  list,
  onOpen,
  mutations,
}: {
  list: CurrentReview[];
  onOpen: (number: number) => void;
  mutations: ReturnType<typeof useCurrentReviewMutations>;
}): ReactElement {
  const { remove, removeStack } = mutations;
  const all = reviewStacks(list);
  return (
    <Part title="Under review" count={all.length}>
      {all
        .filter((stack) => stack.length > 1)
        .map((stack) => (
          <ReviewStackItem
            key={stack[0]?.id}
            stack={stack}
            removing={removeStack.isPending}
            onOpen={() => {
              onOpen(stack[0]?.prNumber ?? 0);
            }}
            onRemove={() => {
              removeStack.mutate(stack.map((review) => review.prNumber));
            }}
          />
        ))}
      {all
        .filter((stack) => stack.length === 1)
        .flat()
        .map((review) => (
          <ReviewItem
            key={review.id}
            review={review}
            removing={remove.isPending}
            onOpen={() => {
              onOpen(review.prNumber);
            }}
            onRemove={() => {
              remove.mutate(review.prNumber);
            }}
          />
        ))}
    </Part>
  );
}

/**
 * The pull requests under review without a ticket, above the rest of the Pull requests tab; nothing
 * while there is none. An opened one shows its review page over the tab.
 */
export function UnderReview({ project }: { project: PublicProject }): ReactElement | null {
  const reviews = useCurrentReviews(project.id);
  const mutations = useCurrentReviewMutations(project.id);
  const [opened, setOpened] = useReviewedPullRequest();
  const list = reviews.data ?? [];
  const stack = reviewStacks(list).find((members) =>
    members.some((review) => review.prNumber === opened),
  );
  const open = stack?.find((review) => review.prNumber === opened);
  if (stack && open) {
    return (
      <StackReview
        projectId={project.id}
        scripts={project.config.scripts ?? []}
        review={open}
        stack={stack}
        onPick={setOpened}
        onClose={() => {
          setOpened(null);
        }}
      />
    );
  }
  const error = reviews.error ?? mutations.remove.error ?? mutations.removeStack.error;
  if (list.length === 0 && error === null) {
    return null;
  }
  return (
    <div className="mb-6">
      <div className="px-4">
        <ErrorText error={error} />
      </div>
      {list.length > 0 ? <ReviewRows list={list} onOpen={setOpened} mutations={mutations} /> : null}
    </div>
  );
}
