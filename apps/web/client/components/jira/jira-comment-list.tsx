// A ticket's Jira comments in its Jira tab, each with Add to review and Reply, then New comment. Also
// how many older comments are left out.

import type { ReactElement } from 'react';

import type { JiraTabView } from '../../../src/jira-comment-types';
import type { JiraCommentSend } from '../../lib/integrations/use-jira-comments';
import type { JiraReviewImport } from '../../lib/integrations/use-jira-review-import';
import { AddToReview } from '../review/add-to-review';
import { TrackerEmpty } from '../tracker/tracker-empty';
import { CARD_CLASS } from '../ui/ui';
import { JiraCommentCard } from './jira-comment';
import { JiraReply } from './jira-reply';

/** The issue has more comments than were read: how many are left out. */
function LeftOut({ view }: { view: JiraTabView }): ReactElement | null {
  const left = view.total - view.comments.length;
  if (left <= 0) {
    return null;
  }
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      The issue has {view.total} comments:{' '}
      {left === 1 ? 'the oldest is not shown' : `the ${left} oldest are not shown`}. Open the issue
      in Jira for it.
    </p>
  );
}

export function JiraComments({
  view,
  sender,
  reviewImport,
}: {
  view: JiraTabView;
  sender: JiraCommentSend;
  reviewImport: JiraReviewImport;
}): ReactElement {
  const pendingFor = (replyTo: string | null): JiraTabView['pending'] =>
    view.pending.filter((comment) => comment.replyTo === replyTo);
  return (
    <>
      <LeftOut view={view} />
      {view.comments.length === 0 ? (
        <TrackerEmpty title="No comments">
          When someone comments on the Jira issue, it shows here: reply to it, or add it to the
          review.
        </TrackerEmpty>
      ) : (
        view.comments.map((comment) => (
          <JiraCommentCard
            key={comment.id}
            comment={comment}
            action={
              <AddToReview
                review={{
                  imported: view.review.importedIds.includes(comment.id),
                  refusal: view.review.refusal,
                  adding: reviewImport.adding === comment.id,
                  onAdd: () => {
                    reviewImport.add(comment.id);
                  },
                }}
              />
            }
          >
            <JiraReply
              // An app's or anonymized author has no account to mention: the reply is a new comment then.
              replyTo={
                comment.accountId === null
                  ? null
                  : { commentId: comment.id, accountId: comment.accountId, name: comment.author }
              }
              label="Reply"
              pending={pendingFor(comment.id)}
              sender={sender}
            />
          </JiraCommentCard>
        ))
      )}
      <section className={CARD_CLASS}>
        <h3 className="text-sm font-semibold">Comment on the issue</h3>
        <JiraReply replyTo={null} label="New comment" pending={pendingFor(null)} sender={sender} />
      </section>
    </>
  );
}
