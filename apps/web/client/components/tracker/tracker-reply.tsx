// A reply in a tracker thread, or a new comment on the item: the comments being sent, then a button that opens
// the box. Where replies are new comments (Jira), it mentions the author first; typing `@` tags anyone. A refused
// comment reopens the box.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import { mentionsAsText } from '@union/core/tracker-mention';
import { useState, type ReactElement } from 'react';

import type { PendingTrackerComment } from '../../../src/tracker-comment-types';
import { boxKey, type TrackerCommentSend } from '../../lib/integrations/use-tracker-comments';
import { Markdown } from '../markdown/markdown';
import { ReplyBox } from '../pull-request/reply-box';
import { Button } from '../ui/ui';

function Sending({ label, text }: { label: string; text: string }): ReactElement {
  return (
    <div className="space-y-1 opacity-70">
      <span className="text-xs text-zinc-500">Sending to {label}…</span>
      <Markdown compact>{mentionsAsText(text)}</Markdown>
    </div>
  );
}

export function TrackerReply({
  kind,
  threadId,
  mention,
  label,
  pending,
  sender,
}: {
  kind: IntegrationKindName;
  /** The thread replied in; null for a new comment. */
  threadId: string | null;
  /** Who the reply mentions first; null for none. */
  mention: { accountId: string; name: string } | null;
  label: string;
  pending: PendingTrackerComment[];
  sender: TrackerCommentSend;
}): ReactElement {
  const tracker = integrationKind(kind);
  const [open, setOpen] = useState(false);
  const key = boxKey(threadId);
  const failure = sender.failures.get(key);
  return (
    <div className="space-y-2">
      {pending.map((comment) => (
        <Sending key={comment.commandId} label={tracker.label} text={comment.text} />
      ))}
      {open || failure ? (
        <ReplyBox
          key={failure?.error ?? 'box'}
          initial={failure?.text ?? ''}
          error={failure?.error ?? null}
          resolvable={false}
          postsAs={
            mention
              ? `Starts with @${mention.name}. ${tracker.commentsPostAs}`
              : tracker.commentsPostAs
          }
          canPost
          mentions={sender.target}
          onSend={async (text) => {
            await sender.send(threadId, mention, text);
            setOpen(false);
          }}
          onCancel={() => {
            sender.dismiss(key);
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
