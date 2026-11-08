// One open discussion of a Notion page: the text it is about, its comments oldest first, then Reply; Add to review sends it to the implementer.

import type { ReactElement } from 'react';

import type {
  NotionCommentView,
  NotionDiscussionView,
  PendingNotionComment,
} from '../../../src/notion-discussion-types';
import type { NotionCommentSend } from '../../lib/integrations/use-notion-comments';
import { formatWhen } from '../../lib/relative-time';
import { Markdown } from '../markdown';
import { AddToReview, type ReviewImportState } from '../review/add-to-review';
import { NotionReply } from './notion-reply';

const CARD =
  'space-y-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900';

const PLACES: Record<NotionDiscussionView['place'], string> = {
  page: 'On the page',
  text: 'On the text',
  block: 'On a block of the page',
};

function Comment({ comment }: { comment: NotionCommentView }): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{comment.author}</span>
        <span className="text-xs text-zinc-500">{formatWhen(comment.createdAt)}</span>
      </div>
      <Markdown compact>{comment.markdown}</Markdown>
    </div>
  );
}

/** What a ticket's tab adds to a discussion: its replies being sent, Reply, and Add to review. */
export type DiscussionActions = {
  pending: PendingNotionComment[];
  sender: NotionCommentSend;
  review: ReviewImportState;
};

/** Without `actions` (a review's Notion tab), read only. */
export function NotionDiscussion({
  discussion,
  actions,
}: {
  discussion: NotionDiscussionView;
  actions?: DiscussionActions;
}): ReactElement {
  return (
    <article className={CARD} aria-label={PLACES[discussion.place]}>
      <div className="flex items-baseline gap-2 text-xs text-zinc-500">
        <span>{PLACES[discussion.place]}</span>
        {actions ? <AddToReview review={actions.review} /> : null}
        <a
          href={discussion.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto hover:underline"
        >
          Open in Notion
        </a>
      </div>
      {discussion.quote === null ? null : (
        <blockquote className="border-l-2 border-amber-400 pl-2 text-zinc-600 dark:text-zinc-400">
          {discussion.quote}
        </blockquote>
      )}
      {discussion.comments.map((comment) => (
        <Comment key={comment.id} comment={comment} />
      ))}
      {actions ? (
        <NotionReply
          discussionId={discussion.id}
          label="Reply"
          pending={actions.pending}
          sender={actions.sender}
        />
      ) : null}
    </article>
  );
}
