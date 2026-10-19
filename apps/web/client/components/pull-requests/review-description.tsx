// A pull request review's Description tab: the row linking its Notion page, then the description from GitHub.
import { githubText } from '@union/core/github-text';
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewDiscussion } from '../../lib/use-review';
import { Markdown } from '../markdown';
import { ErrorText } from '../ui';
import { ReviewNotionLinkRow } from './review-notion-link';

export function ReviewLoading({ error }: { error: Error | null }): ReactElement {
  return error ? (
    <ErrorText error={error} />
  ) : (
    <p className="text-sm text-zinc-500">Reading the pull request on GitHub…</p>
  );
}

/** The pull request's own description, as written on GitHub. */
function DescriptionText({ target }: { target: ReviewTarget }): ReactElement {
  const discussion = useReviewDiscussion(target);
  if (!discussion.data) {
    return <ReviewLoading error={discussion.error} />;
  }
  const text = discussion.data.description;
  // A template left as it was (only its HTML comments) counts as empty.
  return githubText(text) === '' ? (
    <p className="text-sm text-zinc-500">No description.</p>
  ) : (
    <Markdown github>{text}</Markdown>
  );
}

/** The description, under the row that links the pull request to its Notion page. */
export function ReviewDescription({
  target,
  review,
}: {
  target: ReviewTarget;
  review: CurrentReview;
}): ReactElement {
  return (
    <div className="space-y-6">
      <ReviewNotionLinkRow review={review} />
      <DescriptionText target={target} />
    </div>
  );
}
