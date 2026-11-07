// A new comment on a ticket's Jira issue, or a reply to one (it mentions the author): what is being sent, then a
// button that opens the box. A refused comment opens the box again with its text.
import type { JiraReplyTo } from '@union/core/jira-comment-post';
import { useState, type ReactElement } from 'react';

import type { PendingJiraComment } from '../../../src/jira-comment-types';
import { jiraReplyKey, type JiraCommentSend } from '../../lib/use-jira-comments';
import { Markdown } from '../markdown';
import { ReplyBox } from '../pull-request/reply-box';
import { Button } from '../ui';

const POSTS_AS =
  'Markdown: **bold**, `code`, [links](https://…), lists. Posts as the Atlassian account of the Jira connection, visible to everyone who can see the issue';

function Sending({ comment }: { comment: PendingJiraComment }): ReactElement {
  return (
    <div className="space-y-1 opacity-70">
      <span className="text-xs text-zinc-500">Sending to Jira…</span>
      <Markdown compact>{comment.text}</Markdown>
    </div>
  );
}

export function JiraReply({
  replyTo,
  label,
  pending,
  sender,
}: {
  /** The comment answered and its author, mentioned first; null for a new comment. */
  replyTo: JiraReplyTo | null;
  label: string;
  pending: PendingJiraComment[];
  sender: JiraCommentSend;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const boxKey = jiraReplyKey(replyTo?.commentId ?? null);
  const failure = sender.failures.get(boxKey);
  return (
    <div className="space-y-2">
      {pending.map((comment) => (
        <Sending key={comment.commandId} comment={comment} />
      ))}
      {open || failure ? (
        <ReplyBox
          key={failure?.error ?? 'box'}
          initial={failure?.text ?? ''}
          error={failure?.error ?? null}
          resolvable={false}
          postsAs={replyTo ? `Starts with @${replyTo.name}. ${POSTS_AS}` : POSTS_AS}
          canPost
          onSend={async (text) => {
            await sender.send(replyTo, text);
            setOpen(false);
          }}
          onCancel={() => {
            sender.dismiss(boxKey);
            setOpen(false);
          }}
        />
      ) : (
        <Button
          size="sm"
          onClick={() => {
            setOpen(true);
          }}
        >
          {label}
        </Button>
      )}
    </div>
  );
}
