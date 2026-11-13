// The PR tab's line comments: the open threads, then the resolved ones folded behind a line you click.

import type { ReactElement } from 'react';

import type { DiscussionResponse, PullRequestThread } from '../../../src/api-types';
import type { PrReplies } from '../../lib/pull-request/use-pr-replies';
import { ImportComments } from '../review/import-comments';
import { CARD_CLASS } from '../ui/ui';
import { ThreadCard } from './note-card';
import { ReplyArea } from './reply-area';

function Thread({
  thread,
  discussion,
  replies,
}: {
  thread: PullRequestThread;
  discussion: DiscussionResponse;
  replies: PrReplies;
}): ReactElement {
  return (
    <ThreadCard
      thread={thread}
      imported={discussion.imported.includes(thread.comments[0]?.url ?? '')}
      diffIn="ticket"
      reply={
        <ReplyArea
          replies={replies}
          target={{ kind: 'thread', threadId: thread.id }}
          githubUrl={thread.comments[0]?.url}
        />
      }
    />
  );
}

function threadKey(thread: PullRequestThread): string {
  return thread.comments[0]?.url ?? thread.path;
}

function heading(open: number, resolved: number): string {
  if (resolved === 0) {
    return `Line comments (${open})`;
  }
  return `Line comments: ${open} open · ${resolved} resolved`;
}

/** The line comments: open threads first, the resolved ones folded below them. */
export function LineThreads({
  ticketId,
  discussion,
  replies,
}: {
  ticketId: number;
  discussion: DiscussionResponse;
  replies: PrReplies;
}): ReactElement {
  const { threads } = discussion;
  const open = threads.filter((thread) => !thread.resolved);
  const resolved = threads.filter((thread) => thread.resolved);
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{heading(open.length, resolved.length)}</h3>
        {threads.length > 0 ? (
          <ImportComments ticketId={ticketId} pullRequest={discussion.number} />
        ) : null}
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-zinc-500">{resolved.length > 0 ? 'All resolved.' : 'None.'}</p>
      ) : null}
      {open.map((thread) => (
        <Thread key={threadKey(thread)} thread={thread} discussion={discussion} replies={replies} />
      ))}
      {resolved.length > 0 ? (
        <details className="space-y-3">
          <summary className="cursor-pointer text-xs text-zinc-500">
            {resolved.length} resolved
          </summary>
          <div className="mt-3 space-y-3">
            {resolved.map((thread) => (
              <Thread
                key={threadKey(thread)}
                thread={thread}
                discussion={discussion}
                replies={replies}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
