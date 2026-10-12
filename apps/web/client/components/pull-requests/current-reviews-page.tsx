import { useState, type ReactElement } from 'react';

import type { CurrentReview, PublicProject } from '../../../src/api-types';
import { useCurrentReviewMutations, useCurrentReviews } from '../../lib/use-current-reviews';
import { ReviewPage } from '../review/review-page';
import { Badge, Button, ErrorText } from '../ui';
import { prReviewSections } from './pr-review-sections';

/** Where the last posting stands: on its way, or failed with GitHub's reason. */
function PostingBanner({ review }: { review: CurrentReview }): ReactElement | null {
  if (review.submitStatus === 'sending') {
    return (
      <p className="mb-3 rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        Posting the review on #{review.prNumber}…
      </p>
    );
  }
  if (review.submitStatus === 'failed') {
    return (
      <p className="mb-3 rounded-md bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-800 dark:bg-red-950/40 dark:text-red-300">
        Posting failed: {review.submitError}. The comments are still drafts: send again.
      </p>
    );
  }
  return null;
}

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

/** Pull requests put under review from the Pull requests tab, without a ticket. */
export function CurrentReviewsPage({ project }: { project: PublicProject }): ReactElement {
  const reviews = useCurrentReviews(project.id);
  const { remove } = useCurrentReviewMutations(project.id);
  const [opened, setOpened] = useState<number | null>(null);
  const list = reviews.data ?? [];
  const open = list.find((review) => review.prNumber === opened);
  if (open) {
    const target = { kind: 'pull-request', projectId: project.id, number: open.prNumber } as const;
    return (
      <ReviewPage
        target={target}
        title={`#${open.prNumber} ${open.title}`}
        sections={prReviewSections(target)}
        banner={<PostingBanner review={open} />}
        posting={open.submitStatus === 'sending'}
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
          <ErrorText error={reviews.error ?? remove.error} />
        </div>
        {reviews.isSuccess && list.length === 0 ? (
          <p className="px-4 text-sm text-zinc-500">No pull request under review.</p>
        ) : null}
        <ul>
          {list.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              removing={remove.isPending}
              onOpen={() => {
                setOpened(review.prNumber);
              }}
              onRemove={() => {
                remove.mutate(review.prNumber);
              }}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
