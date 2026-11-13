// What a review's tracker row offers in one click: the items the pull request names, and an item for the whole stack.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useReviewStack } from '../../lib/review/review-stack';
import {
  useReviewTrackerSuggestions,
  type ReviewTrackerActions,
} from '../../lib/review/use-review-tracker';
import { ItemLink } from '../tracker/tracker-link-form';
import { Button } from '../ui/ui';

/** "KEY summary" for a tracker naming its items by key, else the title. */
export function itemTitle(
  kind: IntegrationKindName,
  item: { itemId: string; title: string },
): string {
  const { namedByKey, itemLabel } = integrationKind(kind);
  if (namedByKey) {
    return `${item.itemId} ${item.title}`;
  }
  return item.title || `Untitled ${itemLabel}`;
}

/** The items the pull request names (its title, branch, description), each linked in one click. */
export function TrackerSuggestions({
  review,
  kind,
  actions,
  onDone,
}: {
  review: CurrentReview;
  kind: IntegrationKindName;
  actions: ReviewTrackerActions;
  onDone: () => void;
}): ReactElement | null {
  const suggestions = useReviewTrackerSuggestions(review, kind);
  const found = suggestions.data ?? [];
  if (found.length === 0) {
    return null;
  }
  const { label, itemLabel } = integrationKind(kind);
  return (
    <ul className="space-y-1" aria-label={`${label} ${itemLabel}s the pull request names`}>
      {found.map((item) => (
        <li key={item.itemId} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Named in the pull request:</span>
          <ItemLink title={itemTitle(kind, item)} url={item.url} />
          <Button
            disabled={actions.link.isPending}
            onClick={() => {
              actions.link.mutate({ item: item.itemId }, { onSuccess: onDone });
            }}
          >
            Link
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** For a review in a stack whose other pull requests have no item of the tracker: gives them this one too. */
export function LinkStackButton({
  review,
  kind,
  itemId,
  actions,
}: {
  review: CurrentReview;
  kind: IntegrationKindName;
  itemId: string;
  actions: ReviewTrackerActions;
}): ReactElement | null {
  const others = (useReviewStack() ?? []).filter(
    (pull) => pull.number !== review.prNumber && !pull.linked.includes(kind),
  );
  if (others.length === 0) {
    return null;
  }
  return (
    <Button
      disabled={actions.link.isPending}
      title={`Also links ${others.map((pull) => `#${pull.number}`).join(', ')}`}
      onClick={() => {
        actions.link.mutate({ item: itemId, stack: true });
      }}
    >
      Link the whole stack to this {integrationKind(kind).itemLabel}
    </Button>
  );
}
