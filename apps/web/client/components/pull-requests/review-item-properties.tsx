// The Properties card of a page or issue a review is linked to, in the review's Notion or Jira tab, editable.

import type { TrackerProperty } from '@union/core';
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { PendingTrackerField } from '../../../src/tracker-field-types';
import { useTrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { reviewFieldTarget, reviewTrackerBase } from '../../lib/review/review-field-target';
import { TrackerProperties } from '../tracker/tracker-properties';

export function ReviewItemProperties({
  review,
  item,
  queryKey,
}: {
  review: CurrentReview;
  /** The linked item: its tracker and id, its properties and those being set. */
  item: {
    kind: 'notion' | 'jira';
    itemId: string;
    properties: TrackerProperty[];
    pendingFields: PendingTrackerField[];
  };
  /** The tab's list in the query cache. */
  queryKey: unknown[];
}): ReactElement | null {
  const { kind, itemId } = item;
  const sender = useTrackerFieldSend(reviewFieldTarget(review, { kind, itemId }, queryKey));
  const transitionsUrl =
    kind === 'jira'
      ? `${reviewTrackerBase(review)}/jira/${encodeURIComponent(itemId)}/transitions`
      : null;
  return (
    <TrackerProperties
      properties={item.properties}
      editing={{
        kind,
        projectId: review.projectId,
        transitionsUrl,
        pending: item.pendingFields,
        sender,
      }}
    />
  );
}
