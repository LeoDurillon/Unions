// A page or issue a review is linked to, in its Notion or Jira tab: its text and comments, its properties beside them.
// The properties are editable, as in a ticket's tab.

import type { TrackerProperty } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { PendingTrackerField } from '../../../src/tracker-field-types';
import { useTrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { reviewFieldTarget, reviewTrackerBase } from '../../lib/review/review-field-target';
import { TrackerItemLayout } from '../tracker/tracker-item-layout';
import { TrackerProperties } from '../tracker/tracker-properties';

export function ReviewTrackerItem({
  review,
  item,
  queryKey,
  children,
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
  /** The item's text and comments. */
  children: ReactNode;
}): ReactElement {
  const { kind, itemId } = item;
  const sender = useTrackerFieldSend(reviewFieldTarget(review, { kind, itemId }, queryKey));
  const transitionsUrl =
    kind === 'jira'
      ? `${reviewTrackerBase(review)}/jira/${encodeURIComponent(itemId)}/transitions`
      : null;
  const editing = {
    kind,
    projectId: review.projectId,
    transitionsUrl,
    pending: item.pendingFields,
    sender,
  };
  const side =
    item.properties.length > 0 ? (
      <TrackerProperties properties={item.properties} editing={editing} />
    ) : null;
  return <TrackerItemLayout side={side}>{children}</TrackerItemLayout>;
}
