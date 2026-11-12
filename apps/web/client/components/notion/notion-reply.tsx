// Replying in a Notion discussion, or starting one on the page: the comments being sent, then a button that opens the box.

import { useState, type ReactElement } from 'react';

import type { PendingNotionComment } from '../../../src/notion-discussion-types';
import { replyKey, type NotionCommentSend } from '../../lib/integrations/use-notion-comments';
import { Markdown } from '../markdown/markdown';
import { ReplyBox } from '../pull-request/reply-box';
import { Button } from '../ui/ui';

const POSTS_AS = 'Posts under the Notion integration’s name';

function Sending({ comment }: { comment: PendingNotionComment }): ReactElement {
  return (
    <div className="space-y-1 opacity-70">
      <span className="text-xs text-zinc-500">Sending to Notion…</span>
      <Markdown compact>{comment.text}</Markdown>
    </div>
  );
}

/** `discussionId` null starts a page discussion. A refused comment reopens the box with its text. */
export function NotionReply({
  discussionId,
  label,
  pending,
  sender,
}: {
  discussionId: string | null;
  label: string;
  pending: PendingNotionComment[];
  sender: NotionCommentSend;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const failure = sender.failures.get(replyKey(discussionId));
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
          postsAs={POSTS_AS}
          canPost
          onSend={async (text) => {
            await sender.send(discussionId, text);
            setOpen(false);
          }}
          onCancel={() => {
            sender.dismiss(replyKey(discussionId));
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
