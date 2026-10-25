// Under a thread or a note: the replies being posted, the implementer's suggested reply, and Reply (or Quote reply) to write one; Send all above them.
import { githubText } from '@union/core/github-text';
import { quoteReply } from '@union/core/pr-comment-reply';
import { useState, type ReactElement } from 'react';

import { targetKey, type PrReplies, type ReplyTarget } from '../../lib/use-pr-replies';
import { Button } from '../ui';
import { ReplyBox } from './reply-box';
import { Sending, Suggestion } from './suggested-reply';

type Quote = { author: string; body: string };

/** A note is answered by a new comment quoting it; a thread by a reply in it. */
function initialText(quote: Quote | undefined): string {
  return quote ? quoteReply({ author: quote.author, body: githubText(quote.body) }, '') : '';
}

/** The box of a new reply: empty, the note quoted, or the text GitHub refused with its reason. */
function NewReplyBox({
  replies,
  target,
  quote,
  onClose,
}: {
  replies: PrReplies;
  target: ReplyTarget;
  quote: Quote | undefined;
  onClose: () => void;
}): ReactElement {
  const failure = replies.failures.get(targetKey(target));
  const { data } = replies.query;
  return (
    <ReplyBox
      key={failure?.body ?? 'new'}
      initial={failure?.body ?? initialText(quote)}
      error={failure?.error ?? null}
      resolvable={target.kind === 'thread'}
      postsAs={data?.postsAs ?? ''}
      canPost={data?.canPost === true}
      onSend={async (body, resolve) => {
        await replies.send(target, body, resolve);
        onClose();
      }}
      onCancel={() => {
        replies.dismiss(target);
        onClose();
      }}
    />
  );
}

/** Reply (or Quote reply), which opens the box; it opens by itself on a reply GitHub refused. */
function NewReply({
  replies,
  target,
  quote,
}: {
  replies: PrReplies;
  target: ReplyTarget;
  quote: Quote | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  if (open || replies.failures.has(targetKey(target))) {
    return (
      <NewReplyBox
        replies={replies}
        target={target}
        quote={quote}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <Button
      variant="ghost"
      className="text-xs"
      onClick={() => {
        setOpen(true);
      }}
    >
      {quote ? 'Quote reply' : 'Reply'}
    </Button>
  );
}

/**
 * Under a thread or a note: what is being posted, the suggestion (`githubUrl`: the imported
 * comment it answers), and the button that opens the box. `quote`: a note's author and text.
 */
export function ReplyArea({
  replies,
  target,
  githubUrl,
  quote,
}: {
  replies: PrReplies;
  target: ReplyTarget;
  githubUrl: string | undefined;
  quote?: Quote;
}): ReactElement {
  const suggestion = replies.suggestionFor(githubUrl);
  return (
    <div className="space-y-2">
      {replies.pendingFor(target).map((reply) => (
        <Sending key={reply.commandId} body={reply.body} />
      ))}
      {suggestion ? <Suggestion replies={replies} suggestion={suggestion} /> : null}
      <NewReply replies={replies} target={target} quote={quote} />
    </div>
  );
}

/** Above the discussion when the implementer drafted replies: how many, and Send all. */
export function SendAllReplies({ replies }: { replies: PrReplies }): ReactElement | null {
  const drafts = (replies.query.data?.suggested ?? []).filter((one) => one.status === 'draft');
  if (drafts.length === 0) {
    return null;
  }
  const count = drafts.length === 1 ? 'a reply' : `${drafts.length} replies`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-indigo-50 px-3 py-2 text-sm dark:bg-indigo-950/40">
      <span>The implementer drafted {count} to the comments it worked on. Read them below.</span>
      <Button
        variant="primary"
        className="ml-auto"
        disabled={replies.busy || replies.query.data?.canPost !== true}
        onClick={() => {
          replies.sendAll();
        }}
      >
        Send all replies ({drafts.length})
      </Button>
    </div>
  );
}
