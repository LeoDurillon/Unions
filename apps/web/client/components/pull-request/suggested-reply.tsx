// The implementer's suggested reply under a thread or note (edit, send, discard), and a reply being sent.
import { useState, type ReactElement } from 'react';

import type { SuggestedReply } from '../../../src/reply-api-types';
import type { PrReplies } from '../../lib/use-pr-replies';
import { Badge, Button } from '../ui';
import { CommentBody } from './comment-body';
import { ReplyBox } from './reply-box';

const DIMMED = 'space-y-1 rounded-md bg-zinc-50 px-2 py-1 opacity-70 dark:bg-zinc-950';

/** A reply on its way to GitHub. */
export function Sending({ body }: { body: string }): ReactElement {
  return (
    <div className={DIMMED}>
      <p className="text-xs text-zinc-500">Sending…</p>
      <CommentBody text={body} />
    </div>
  );
}

function SuggestionButtons({
  replies,
  suggestion,
  onEdit,
}: {
  replies: PrReplies;
  suggestion: SuggestedReply;
  onEdit: () => void;
}): ReactElement {
  const { commentId } = suggestion;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={replies.busy || replies.query.data?.canPost !== true}
        onClick={() => {
          replies.sendSuggestion(commentId);
        }}
      >
        Send
      </Button>
      <Button disabled={replies.busy} onClick={onEdit}>
        Edit
      </Button>
      <Button
        variant="quietDanger"
        disabled={replies.busy}
        onClick={() => {
          replies.discard(commentId);
        }}
      >
        Discard
      </Button>
      <span className="ml-auto text-xs text-zinc-500">{replies.query.data?.postsAs}</span>
    </div>
  );
}

function SuggestionCard({
  replies,
  suggestion,
  onEdit,
}: {
  replies: PrReplies;
  suggestion: SuggestedReply;
  onEdit: () => void;
}): ReactElement {
  const resolves = suggestion.kind === 'line' && suggestion.resolve;
  return (
    <div className="space-y-2 rounded-md border border-dashed border-indigo-300 px-2 py-1 dark:border-indigo-800">
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">Suggested reply</span>
        <Badge tone="neutral">
          {suggestion.author === 'agent' ? 'by the implementer' : 'edited'}
        </Badge>
        {resolves ? <Badge tone="green">resolves the thread</Badge> : null}
      </p>
      <CommentBody text={suggestion.body} />
      {suggestion.error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{suggestion.error}</p>
      ) : null}
      <SuggestionButtons replies={replies} suggestion={suggestion} onEdit={onEdit} />
    </div>
  );
}

/** The implementer's reply, to edit, send or discard; dimmed while it is being sent. */
export function Suggestion({
  replies,
  suggestion,
}: {
  replies: PrReplies;
  suggestion: SuggestedReply;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  if (suggestion.status === 'sending') {
    return <Sending body={suggestion.body} />;
  }
  if (!editing) {
    return (
      <SuggestionCard
        replies={replies}
        suggestion={suggestion}
        onEdit={() => {
          setEditing(true);
        }}
      />
    );
  }
  return (
    <ReplyBox
      initial={suggestion.body}
      resolvable={suggestion.kind === 'line'}
      initialResolve={suggestion.resolve}
      postsAs={replies.query.data?.postsAs ?? ''}
      canPost
      sendLabel="Save"
      onSend={async (body, resolve) => {
        await replies.edit(suggestion.commentId, { body, resolve });
        setEditing(false);
      }}
      onCancel={() => {
        setEditing(false);
      }}
    />
  );
}
