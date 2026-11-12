// A ticket's Notion tab: the open discussions of its page, read once per opening, with Refresh, replies and New comment.

import type { ReactElement } from 'react';

import type { NotionTabView } from '../../../src/notion-discussion-types';
import {
  useNotionComments,
  useNotionCommentSend,
  type NotionCommentSend,
} from '../../lib/integrations/use-notion-comments';
import {
  useNotionReviewImport,
  type NotionReviewImport,
} from '../../lib/integrations/use-notion-review-import';
import { Button, CARD_CLASS, ErrorText } from '../ui/ui';
import { NotionDiscussion } from './notion-discussion';
import { NotionReply } from './notion-reply';

/** The page has no open discussion: what would show here. */
function NoDiscussions(): ReactElement {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
      >
        ✓
      </span>
      <p className="mt-1 text-sm font-semibold">No open comments</p>
      <p className="max-w-sm text-xs text-zinc-500">
        When someone comments on the Notion page, the discussion shows here: reply to it, or add it
        to the review.
      </p>
    </div>
  );
}

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
        <NoDiscussions />
      ) : (
        view.discussions.map((discussion) => (
          <NotionDiscussion
            key={discussion.id}
            discussion={discussion}
            actions={{
              pending: pendingIn(discussion.id),
              sender,
              review: (commentId) => {
                const id = commentId ?? discussion.id;
                return {
                  imported: view.review.importedIds.includes(id),
                  refusal: view.review.refusal,
                  adding: reviewImport.adding === id,
                  onAdd: () => {
                    reviewImport.add({ discussionId: discussion.id, commentId });
                  },
                };
              },
            }}
          />
        ))
      )}
      <section className={CARD_CLASS}>
        <h3 className="text-sm font-semibold">Comment on the page</h3>
        <NotionReply
          discussionId={null}
          label="New comment"
          pending={pendingIn(null)}
          sender={sender}
        />
      </section>
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
      <div className={`${CARD_CLASS} flex items-center gap-3 space-y-0`}>
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-800"
        >
          N
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notion page</p>
          <p className="text-xs text-zinc-500">Its open discussions, read when the tab opens.</p>
        </div>
        {data ? (
          <a
            href={data.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Open in Notion ↗
          </a>
        ) : null}
        <Button
          className="shrink-0"
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
