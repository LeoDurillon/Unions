// The tabs a pull request review shows before its diff; Notion once it is linked to a page.
import type { CurrentReview } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import type { ReviewSection } from '../review/review-page';
import { ReviewCommentsTab } from './review-comments-tab';
import { ReviewDescription } from './review-description';
import { ReviewNotionTab } from './review-notion-tab';

/** The tabs a pull request review shows before its diff; Notion once it is linked to a page. */
export function prReviewSections(target: ReviewTarget, review: CurrentReview): ReviewSection[] {
  const count = review.notionPages.length;
  const notion: ReviewSection[] =
    count > 0
      ? [
          {
            id: 'notion',
            label: count > 1 ? `Notion (${count})` : 'Notion',
            content: <ReviewNotionTab review={review} />,
          },
        ]
      : [];
  return [
    {
      id: 'description',
      label: 'Description',
      content: <ReviewDescription target={target} review={review} />,
    },
    ...notion,
    {
      id: 'comments',
      label: 'Comments',
      content: <ReviewCommentsTab target={target} number={review.prNumber} />,
    },
  ];
}
