// A ticket's Jira tab: the comments of the issue it was imported from, read once per opening. With
// Refresh, Reply on each and New comment, which the worker posts.

import type { ReactElement } from 'react';

import type { JiraTabView } from '../../../src/jira-comment-types';
import {
  useJiraComments,
  useJiraCommentSend,
  type JiraCommentSend,
} from '../../lib/integrations/use-jira-comments';
import {
  useJiraReviewImport,
  type JiraReviewImport,
} from '../../lib/integrations/use-jira-review-import';
import { AddToReview } from '../review/add-to-review';
import { Button, ErrorText } from '../ui/ui';
import { JiraCommentCard } from './jira-comment';
import { JiraReply } from './jira-reply';

function Comments({
  view,
  sender,
  reviewImport,
}: {
  view: JiraTabView;
  sender: JiraCommentSend;
  reviewImport: JiraReviewImport;
}): ReactElement {
  const left = view.total - view.comments.length;
  const pendingFor = (replyTo: string | null): JiraTabView['pending'] =>
    view.pending.filter((comment) => comment.replyTo === replyTo);
  return (
    <>
      {left > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The issue has {view.total} comments:{' '}
          {left === 1 ? 'the oldest is not shown' : `the ${left} oldest are not shown`}. Open the
          issue in Jira for it.
        </p>
      ) : null}
      {view.comments.length === 0 ? (
        <p className="text-sm text-zinc-500">No comments on the issue.</p>
      ) : (
        view.comments.map((comment) => (
          <JiraCommentCard key={comment.id} comment={comment}>
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
      <JiraReply replyTo={null} label="New comment" pending={pendingFor(null)} sender={sender} />
    </>
  );
}

export function JiraTab({ ticketId }: { ticketId: number }): ReactElement {
  const comments = useJiraComments(ticketId);
  const sender = useJiraCommentSend(ticketId);
  const reviewImport = useJiraReviewImport(ticketId);
  const { data } = comments;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {data ? (
          <a
            href={data.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-zinc-500 hover:underline"
          >
            Open {data.key} in Jira
          </a>
        ) : null}
        <Button
          className="ml-auto"
          disabled={comments.isFetching}
          onClick={() => {
            void comments.refetch();
          }}
        >
          {comments.isFetching ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <ErrorText error={comments.error ?? reviewImport.error} />
      {!data && comments.isFetching ? (
        <p className="text-sm text-zinc-500">Reading the comments on Jira…</p>
      ) : null}
      {data ? <Comments view={data} sender={sender} reviewImport={reviewImport} /> : null}
    </div>
  );
}
