// Pull requests put under review from the Pull requests tab, without a ticket; a stack opens with a
// tab per pull request.
import { useState, type ReactElement } from 'react';

import type { CurrentReview, PublicProject } from '../../../src/api-types';
import { reviewStacks } from '../../lib/pull-request-stacks';
import { useCurrentReviewMutations, useCurrentReviews } from '../../lib/use-current-reviews';
import { Badge, Button, ErrorText } from '../ui';
import { Part } from './list-part';
import { ReviewStackItem } from './review-stack-item';
import { StackReview } from './stack-review';

function ReviewItem({
  review,
  removing,
  onOpen,
  onRemove,
}: {
  review: CurrentReview;
  removing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <li className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0 flex-1 space-y-1">
        <a
          href={review.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:text-indigo-600 hover:underline dark:hover:text-indigo-400"
        >
          {review.title}
        </a>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <span>
            #{review.prNumber} by @{review.author} · added{' '}
            {new Date(review.createdAt).toLocaleString()}
          </span>
          <span className="truncate font-mono">
            {review.headBranch} → {review.baseBranch}
          </span>
          {review.submitStatus === 'sending' ? <Badge tone="blue">posting…</Badge> : null}
          {review.submitStatus === 'failed' ? <Badge tone="red">posting failed</Badge> : null}
          {review.previewStatus === 'running' ? <Badge tone="green">preview running</Badge> : null}
          {review.notionTitle ? (
            <Badge tone="neutral" title={`Notion: ${review.notionTitle}`}>
              Notion
            </Badge>
          ) : null}
        </p>
      </div>
      <Button variant="primary" onClick={onOpen}>
        Open review
      </Button>
      <Button disabled={removing} onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}

/** The reviews, stacks first in their own part when there are any; `onOpen` opens a pull request. */
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
  const stacks = all.filter((stack) => stack.length > 1);
  const rows = all
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
    ));
  if (stacks.length === 0) {
    return <ul>{rows}</ul>;
  }
  return (
    <>
      <div className="mb-6">
        <Part title="Stacks" count={stacks.length}>
          {stacks.map((stack) => (
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
        </Part>
      </div>
      {rows.length > 0 ? (
        <Part title="Pull requests" count={rows.length}>
          {rows}
        </Part>
      ) : null}
    </>
  );
}

/** Pull requests put under review from the Pull requests tab, without a ticket; a stack opens with a tab per pull request. */
export function CurrentReviewsPage({ project }: { project: PublicProject }): ReactElement {
  const reviews = useCurrentReviews(project.id);
  const mutations = useCurrentReviewMutations(project.id);
  const [opened, setOpened] = useState<number | null>(null);
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
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
        Add pull requests from the Pull requests tab (hover one that has no ticket).
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-3">
          <ErrorText
            error={reviews.error ?? mutations.remove.error ?? mutations.removeStack.error}
          />
        </div>
        {reviews.isSuccess && list.length === 0 ? (
          <p className="px-4 text-sm text-zinc-500">No pull request under review.</p>
        ) : null}
        <ReviewRows list={list} onOpen={setOpened} mutations={mutations} />
      </div>
    </div>
  );
}
