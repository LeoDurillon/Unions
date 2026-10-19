// What the Notion page row offers in one click: the pages the description links to, and the same page for the whole stack.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useReviewStack } from '../../lib/review-stack';
import { useReviewNotionSuggestions, type useReviewNotionLink } from '../../lib/use-review-notion';
import { Button } from '../ui';

type LinkActions = ReturnType<typeof useReviewNotionLink>;

/** "Link _Export to CSV_?" for each readable page the description links to; never linked on their own. */
export function NotionSuggestions({
  review,
  actions,
  onDone,
}: {
  review: CurrentReview;
  actions: LinkActions;
  onDone: () => void;
}): ReactElement | null {
  const suggestions = useReviewNotionSuggestions(review, true);
  const pages = suggestions.data ?? [];
  if (pages.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1" aria-label="Notion pages in the description">
      {pages.map((page) => (
        <li key={page.pageId}>
          <Button
            disabled={actions.link.isPending}
            title={`From the description: ${page.url}`}
            onClick={() => {
              actions.link.mutate({ page: page.pageId }, { onSuccess: onDone });
            }}
          >
            Link <em>{page.title}</em>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** For a review in a stack whose other pull requests have no page: gives them this one too. */
export function LinkStackButton({
  review,
  actions,
}: {
  review: CurrentReview;
  actions: LinkActions;
}): ReactElement | null {
  const others = (useReviewStack() ?? []).filter(
    (pull) => pull.number !== review.prNumber && pull.notionPageId === null,
  );
  const page = review.notionPageId;
  if (others.length === 0 || page === null) {
    return null;
  }
  return (
    <Button
      disabled={actions.link.isPending}
      title={`Also links ${others.map((pull) => `#${pull.number}`).join(', ')}`}
      onClick={() => {
        actions.link.mutate({ page, stack: true });
      }}
    >
      Link the whole stack to this page
    </Button>
  );
}
