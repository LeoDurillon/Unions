// A ticket's Notion tab: the open discussions of its page, read once per opening, with Refresh, replies and New comment.
import type { ReactElement } from 'react';

import type { NotionTabView } from '../../../src/notion-discussion-types';
import {
  useNotionComments,
  useNotionCommentSend,
  type NotionCommentSend,
} from '../../lib/use-notion-comments';
import { useNotionReviewImport, type NotionReviewImport } from '../../lib/use-notion-review-import';
import { Button, ErrorText } from '../ui';
import { NotionDiscussion } from './notion-discussion';
import { NotionReply } from './notion-reply';

function Discussions({
  view,
  sender,
  reviewImport,
}: {
  view: NotionTabView;
  sender: NotionCommentSend;
  reviewImport: NotionReviewImport;
}): ReactElement {
  const pendingIn = (discussionId: string | null): NotionTabView['pending'] =>
    view.pending.filter((comment) => comment.discussionId === discussionId);
  return (
    <>
      {view.truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The page has many commented passages: only the first ones were read. Open the page in
          Notion for the rest.
        </p>
      ) : null}
      {view.discussions.length === 0 ? (
        <p className="text-sm text-zinc-500">No open comments on the page.</p>
      ) : (
        view.discussions.map((discussion) => (
          <NotionDiscussion
            key={discussion.id}
            discussion={discussion}
            actions={{
              pending: pendingIn(discussion.id),
              sender,
              review: {
                imported: view.review.importedIds.includes(discussion.id),
                refusal: view.review.refusal,
                adding: reviewImport.adding === discussion.id,
                onAdd: () => {
                  reviewImport.add(discussion.id);
                },
              },
            }}
          />
        ))
      )}
      <NotionReply
        discussionId={null}
        label="New comment"
        pending={pendingIn(null)}
        sender={sender}
      />
    </>
  );
}

export function NotionTab({ ticketId }: { ticketId: number }): ReactElement {
  const comments = useNotionComments(ticketId);
  const sender = useNotionCommentSend(ticketId);
  const reviewImport = useNotionReviewImport(ticketId);
  const { data } = comments;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {data ? (
          <a
            href={data.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-zinc-500 hover:underline"
          >
            Open the page in Notion
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
        <p className="text-sm text-zinc-500">Reading the comments on Notion…</p>
      ) : null}
      {data ? <Discussions view={data} sender={sender} reviewImport={reviewImport} /> : null}
    </div>
  );
}
