// The tracker tab's threads once read: each with Reply and Add to review, then a new comment on the item.
// It first says what the read left out.

import type { TrackerThread } from '@union/core';
import { integrationKind } from '@union/core/integration-kinds';
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
import { LeftOut, NoComments } from './tracker-list-notes';
import { TrackerReply } from './tracker-reply';
import { TrackerThreadCard } from './tracker-thread';

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
        <NoComments kind={kind} />
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
