// The badges a review's card shows for the trackers' items it is linked to: "Notion", "Jira 2", "Notion 1/3".

import { integrationKinds } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { Badge } from '../ui/ui';

/** One badge per tracker the review has items of, their titles in its tooltip. */
export function ReviewTrackerBadges({ review }: { review: CurrentReview }): ReactElement {
  return (
    <>
      {integrationKinds().map(({ kind, label }) => {
        const items = review.linkedItems[kind];
        return items.length > 0 ? (
          <Badge
            key={kind}
            tone="neutral"
            title={items.map((item) => `${label}: ${item.title}`).join('\n')}
          >
            {items.length > 1 ? `${label} ${items.length}` : label}
          </Badge>
        ) : null;
      })}
    </>
  );
}

/** One badge per tracker some of the stack's reviews have items of: how many of them do. */
export function StackTrackerBadges({ stack }: { stack: CurrentReview[] }): ReactElement {
  return (
    <>
      {integrationKinds().map(({ kind, label }) => {
        const linked = stack.filter((review) => review.linkedItems[kind].length > 0);
        if (linked.length === 0) {
          return null;
        }
        const titles = linked.map(
          (review) =>
            `#${review.prNumber}: ${review.linkedItems[kind].map((item) => item.title).join(', ')}`,
        );
        return (
          <Badge key={kind} tone="neutral" title={titles.join('\n')}>
            {linked.length === stack.length ? label : `${label} ${linked.length}/${stack.length}`}
          </Badge>
        );
      })}
    </>
  );
}
