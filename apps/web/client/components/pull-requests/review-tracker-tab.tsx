// A review's tab for one tracker: each linked item's properties (editable), text and comments (read only).
// The text is as the tracker has it now, folded when long; the tab has Refresh.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewTrackerItem as Item } from '../../../src/review-tracker-types';
import { reviewTrackerKey, useReviewTrackerItems } from '../../lib/review/use-review-tracker';
import { FoldedMarkdown } from '../markdown/folded-markdown';
import { TrackerThreadCard } from '../tracker/tracker-thread';
import { Button, ErrorText } from '../ui/ui';
import { ReviewTrackerItem } from './review-tracker-item';
import { itemTitle } from './review-tracker-offers';

/** The item's comments, read only: replying and Add to review are a ticket's. */
function Comments({ kind, item }: { kind: IntegrationKindName; item: Item }): ReactElement | null {
  const { threads } = item;
  if ('error' in threads) {
    return <p className="text-xs text-amber-700 dark:text-amber-400">{threads.error}</p>;
  }
  if (threads.threads.length === 0) {
    return null;
  }
  const { many } = integrationKind(kind).commentCount;
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {many} ({threads.threads.length})
      </h4>
      {threads.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          It has many commented passages: only the first ones were read.
        </p>
      ) : null}
      {threads.threads.map((thread) => (
        <TrackerThreadCard key={thread.id} kind={kind} thread={thread} />
      ))}
    </div>
  );
}

function ItemText({
  review,
  kind,
  item,
}: {
  review: CurrentReview;
  kind: IntegrationKindName;
  item: Item;
}): ReactElement {
  const { label, itemLabel } = integrationKind(kind);
  const title = itemTitle(kind, item);
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="text-sm font-semibold">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
          title={`Open in ${label}`}
        >
          {title}
        </a>
      </h3>
      <ReviewTrackerItem
        review={review}
        item={{ kind, ...item }}
        queryKey={reviewTrackerKey(review, kind)}
      >
        {item.truncated ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The {itemLabel} is very long: {label} returned only its first part.
          </p>
        ) : null}
        {item.markdown === '' ? (
          <p className="text-sm text-zinc-500">No text.</p>
        ) : (
          <FoldedMarkdown>{item.markdown}</FoldedMarkdown>
        )}
        <Comments kind={kind} item={item} />
      </ReviewTrackerItem>
    </section>
  );
}

export function ReviewTrackerTab({
  review,
  kind,
}: {
  review: CurrentReview;
  kind: IntegrationKindName;
}): ReactElement {
  const items = useReviewTrackerItems(review, kind);
  const { label, itemLabel } = integrationKind(kind);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={items.isFetching}
          onClick={() => {
            void items.refetch();
          }}
        >
          {items.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={items.error} />
      {!items.data && items.isFetching ? (
        <p className="text-sm text-zinc-500">
          Reading the {itemLabel}s on {label}…
        </p>
      ) : null}
      {(items.data ?? []).map((item) => (
        <ItemText key={item.itemId} review={review} kind={kind} item={item} />
      ))}
    </div>
  );
}
