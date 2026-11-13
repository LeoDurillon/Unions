// One thread of a tracker item's comments: where it is, the text it is about, its comments oldest first.
// Then what the tab adds under it (Reply). Add to review sends the thread, or one comment of it on the item, to the
// implementer.

import type { TrackerComment, TrackerThread } from '@union/core';
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement, ReactNode } from 'react';

import { formatWhen } from '../../lib/ui/relative-time';
import { Markdown } from '../markdown/markdown';
import { AddToReview, type ReviewImportState } from '../review/add-to-review';
import { Badge, CARD_CLASS } from '../ui/ui';

const CARD = `${CARD_CLASS} text-sm`;

const PLACES: Record<TrackerThread['place'], (itemLabel: string) => string> = {
  item: (itemLabel) => `On the ${itemLabel}`,
  text: () => 'On the text',
  block: (itemLabel) => `On a block of the ${itemLabel}`,
};

function placeLabel(place: TrackerThread['place'], itemLabel: string): string {
  return PLACES[place](itemLabel);
}

function OpenLink({ url, label }: { url: string; label: string }): ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-auto text-xs text-zinc-500 hover:underline"
    >
      Open in {label}
    </a>
  );
}

function Comment({
  comment,
  review,
  open,
}: {
  comment: TrackerComment;
  review?: ReviewImportState | undefined;
  /** The link to the comment, when the thread has no line of its own to hold it. */
  open: ReactNode;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{comment.author}</span>
        <span className="text-xs text-zinc-500">
          {formatWhen(comment.createdAt)}
          {comment.edited ? ' · edited' : ''}
        </span>
        {comment.restriction === null ? null : <Badge tone="amber">{comment.restriction}</Badge>}
        {review ? <AddToReview review={review} /> : null}
        {open}
      </div>
      <Markdown compact>{comment.markdown === '' ? '*(empty)*' : comment.markdown}</Markdown>
    </div>
  );
}

/**
 * Without `review` (a review's tabs), read only. A thread on the item itself is most often one request
 * per comment: each comment is added alone, other threads whole. A lone comment on the item shows
 * without the thread's line.
 */
export function TrackerThreadCard({
  kind,
  thread,
  review,
  children,
}: {
  kind: IntegrationKindName;
  thread: TrackerThread;
  review?: (commentId: string | null) => ReviewImportState;
  /** Under the comments: Reply, and what is being sent in answer. */
  children?: ReactNode;
}): ReactElement {
  const { label, itemLabel } = integrationKind(kind);
  const perComment = thread.place === 'item';
  const lone = perComment && thread.comments.length === 1;
  return (
    <article className={CARD} aria-label={placeLabel(thread.place, itemLabel)}>
      {lone ? null : (
        <div className="flex items-baseline gap-2 text-xs text-zinc-500">
          <span>{placeLabel(thread.place, itemLabel)}</span>
          {review && !perComment ? <AddToReview review={review(null)} /> : null}
          <OpenLink url={thread.url} label={label} />
        </div>
      )}
      {thread.quote === null ? null : (
        <blockquote className="border-l-2 border-amber-400 pl-2 text-zinc-600 dark:text-zinc-400">
          {thread.quote}
        </blockquote>
      )}
      {thread.comments.map((comment) => (
        <Comment
          key={comment.id}
          comment={comment}
          review={review && perComment ? review(comment.id) : undefined}
          open={lone ? <OpenLink url={comment.url} label={label} /> : null}
        />
      ))}
      {children}
    </article>
  );
}
