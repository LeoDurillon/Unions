// The Pull requests tab's "Under review" part: pull requests put under review without a ticket, stacks
// first; Open review opens the review page (a stack's with a tab per pull request).
import { useState, type ReactElement } from 'react';

import type { CurrentReview, PublicProject } from '../../../src/api-types';
import { reviewStacks } from '../../lib/pull-request-stacks';
import { useCurrentReviewMutations, useCurrentReviews } from '../../lib/use-current-reviews';
import { ConfirmButton } from '../confirm-button';
import { TrashIcon } from '../icon-button';
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
          {review.notionPages.length > 0 ? (
            <Badge
              tone="neutral"
              title={review.notionPages.map((page) => `Notion: ${page.title}`).join('\n')}
            >
              {review.notionPages.length > 1 ? `Notion ${review.notionPages.length}` : 'Notion'}
            </Badge>
          ) : null}
        </p>
      </div>
      <Button onClick={onOpen}>Open review</Button>
      <ConfirmButton
        label={`Stop reviewing #${review.prNumber}`}
        icon={<TrashIcon />}
        question="Stop reviewing it? Its drafts and preview are removed."
        confirmLabel="Remove"
        disabled={removing}
        onConfirm={onRemove}
      />
    </li>
  );
}

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
