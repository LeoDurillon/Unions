// The tracker tab's threads once read: each with Reply and Add to review, then a new comment on the item.
// It first says what the read left out.

import type { TrackerThread } from '@union/core';
import { integrationKind, type IntegrationKind } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { TrackerCommentsView } from '../../../src/tracker-comment-types';
import {
  useTrackerCommentSend,
  type TrackerCommentSend,
} from '../../lib/integrations/use-tracker-comments';
import {
  useTrackerReviewImport,
  type TrackerReviewImport,
} from '../../lib/integrations/use-tracker-review-import';
import { CARD_CLASS, ErrorText } from '../ui/ui';
import { TrackerEmpty } from './tracker-empty';
import { TrackerReply } from './tracker-reply';
import { TrackerThreadCard } from './tracker-thread';

const NOTE = 'text-xs text-amber-700 dark:text-amber-400';

/** What the read left out: places of the item not read, or its oldest comments. */
function LeftOut({
  view,
  kind,
}: {
  view: TrackerCommentsView;
  kind: IntegrationKind;
}): ReactElement | null {
  const { label, itemLabel } = kind;
  const shown = view.threads.reduce((sum, thread) => sum + thread.comments.length, 0);
  const left = view.total - shown;
  if (view.truncated) {
    return (
      <p className={NOTE}>
        The {itemLabel} has many commented passages: only the first ones were read. Open the{' '}
        {itemLabel} in {label} for the rest.
      </p>
    );
  }
  if (left <= 0) {
    return null;
  }
  return (
    <p className={NOTE}>
      The {itemLabel} has {view.total} comments:{' '}
      {left === 1 ? 'the oldest is not shown' : `the ${left} oldest are not shown`}. Open the{' '}
      {itemLabel} in {label} for it.
    </p>
  );
}

/** One thread: Add to review for it (or each comment on the item), Reply and its replies being sent. */
function Thread({
  thread,
  view,
  sender,
  reviewImport,
}: {
  thread: TrackerThread;
  view: TrackerCommentsView;
  sender: TrackerCommentSend;
  reviewImport: TrackerReviewImport;
}): ReactElement {
  const kind = integrationKind(view.kind);
  return (
    <TrackerThreadCard
      kind={view.kind}
      thread={thread}
      review={(commentId) => ({
        imported: view.review.importedIds.includes(commentId ?? thread.id),
        refusal: view.review.refusal,
        adding: reviewImport.adding === (commentId ?? thread.id),
        onAdd: () => {
          reviewImport.add({ threadId: thread.id, commentId });
        },
      })}
    >
      <TrackerReply
        kind={view.kind}
        threadId={thread.id}
        mention={kind.commentReplies === 'mention' ? (thread.comments[0]?.mention ?? null) : null}
        label="Reply"
        pending={view.pending.filter((comment) => comment.threadId === thread.id)}
        sender={sender}
      />
    </TrackerThreadCard>
  );
}

export function TrackerThreadList({
  ticketId,
  view,
}: {
  ticketId: number;
  view: TrackerCommentsView;
}): ReactElement {
  const kind = integrationKind(view.kind);
  const sender = useTrackerCommentSend(ticketId, view.kind);
  const reviewImport = useTrackerReviewImport(ticketId, view.kind);
  return (
    <>
      <ErrorText error={reviewImport.error} />
      <LeftOut view={view} kind={kind} />
      {view.threads.length === 0 ? (
        <TrackerEmpty title="No open comments">
          When someone comments on the {kind.label} {kind.itemLabel}, it shows here: reply to it, or
          add it to the review.
        </TrackerEmpty>
      ) : (
        view.threads.map((thread) => (
          <Thread
            key={thread.id}
            thread={thread}
            view={view}
            sender={sender}
            reviewImport={reviewImport}
          />
        ))
      )}
      <section className={CARD_CLASS}>
        <h3 className="text-sm font-semibold">Comment on the {kind.itemLabel}</h3>
        <TrackerReply
          kind={view.kind}
          threadId={null}
          mention={null}
          label="New comment"
          pending={view.pending.filter((comment) => comment.threadId === null)}
          sender={sender}
        />
      </section>
    </>
  );
}
