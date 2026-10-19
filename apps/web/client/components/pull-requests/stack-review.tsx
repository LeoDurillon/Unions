// A pull request under review opened full page; one of a stack gets a tab per pull request of it, to switch between them.
import type { ProjectScript } from '@union/core';
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { ReviewNotionContext } from '../../lib/review-notion-context';
import { ReviewStackContext } from '../../lib/review-stack';
import { ReviewPage } from '../review/review-page';
import { prReviewSections } from './pr-review-sections';
import { reviewPreviewSection } from './review-preview-tab';
import { StackTabs } from './stack-tabs';

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

/** `review` is reviewed; `stack` (bottom first, `review` in it) gives the tabs when it has others. */
export function StackReview({
  projectId,
  scripts,
  review,
  stack,
  onPick,
  onClose,
}: {
  projectId: number;
  /** The project's saved scripts, for the Preview tab's commands. */
  scripts: readonly ProjectScript[];
  review: CurrentReview;
  stack: CurrentReview[];
  onPick: (number: number) => void;
  onClose: () => void;
}): ReactElement {
  const target = { kind: 'pull-request', projectId, number: review.prNumber } as const;
  const pulls =
    stack.length > 1
      ? stack.map((member) => ({
          number: member.prNumber,
          title: member.title,
          notionPageId: member.notionPageId,
        }))
      : null;
  return (
    <ReviewStackContext.Provider value={pulls}>
      <ReviewNotionContext.Provider value={review.notionPageId}>
        <ReviewPage
          // Another pull request starts afresh: its first section, no file open.
          key={review.prNumber}
          target={target}
          title={`#${review.prNumber} ${review.title}`}
          sections={[...prReviewSections(target, review), reviewPreviewSection(target, scripts)]}
          stackTabs={
            stack.length > 1 ? (
              <StackTabs
                projectId={projectId}
                stack={stack}
                current={review.prNumber}
                onPick={onPick}
              />
            ) : undefined
          }
          banner={<PostingBanner review={review} />}
          posting={review.submitStatus === 'sending'}
          onClose={onClose}
        />
      </ReviewNotionContext.Provider>
    </ReviewStackContext.Provider>
  );
}
