// A pull request's line comments: the open threads, then the resolved ones folded behind a line you click.
// The ticket's PR tab and an imported pull request's Comments tab both show them.

import type { ReactElement, ReactNode } from 'react';

import type { DiscussionResponse, PullRequestThread } from '../../../src/api-types';
import type { PrReplies } from '../../lib/pull-request/use-pr-replies';
import type { ReviewPageKind } from '../../lib/review/review-url';
import { ImportComments } from '../review/import-comments';
import { CARD_CLASS } from '../ui/ui';
import { ThreadCard } from './note-card';
import { ReplyArea } from './reply-area';

type ThreadsProps = {
  threads: PullRequestThread[];
  replies: PrReplies;
  /** The review page whose diff a thread's place opens. */
  diffIn: ReviewPageKind;
  /** The first comment URLs already taken into the review; none on a page without one. */
  imported?: readonly string[];
};

const NONE_IMPORTED: readonly string[] = [];

function firstUrl(thread: PullRequestThread): string | undefined {
  return thread.comments[0]?.url;
}

function ThreadList({
  threads,
  replies,
  diffIn,
  imported = NONE_IMPORTED,
}: ThreadsProps): ReactElement {
  return (
    <>
      {threads.map((thread) => (
        <ThreadCard
          key={firstUrl(thread) ?? thread.path}
          thread={thread}
          imported={imported.includes(firstUrl(thread) ?? '')}
          diffIn={diffIn}
          reply={
            <ReplyArea
              replies={replies}
              target={{ kind: 'thread', threadId: thread.id }}
              githubUrl={firstUrl(thread)}
            />
          }
        />
      ))}
    </>
  );
}

function heading(open: number, resolved: number): string {
  if (resolved === 0) {
    return `Line comments (${open})`;
  }
  return `Line comments: ${open} open · ${resolved} resolved`;
}

/** The line comments: open threads first, the resolved ones folded below them. */
export function LineThreads({
  className,
  action,
  ...props
}: ThreadsProps & {
  className: string;
  /** Beside the heading, when there are threads (the ticket's Import). */
  action?: ReactNode;
}): ReactElement {
  const { threads } = props;
  const open = threads.filter((thread) => !thread.resolved);
  const resolved = threads.filter((thread) => thread.resolved);
  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{heading(open.length, resolved.length)}</h3>
        {threads.length > 0 ? action : null}
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-zinc-500">{resolved.length > 0 ? 'All resolved.' : 'None.'}</p>
      ) : null}
      <ThreadList {...props} threads={open} />
      {resolved.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-500">
            {resolved.length} resolved
          </summary>
          <div className="mt-3 space-y-3">
            <ThreadList {...props} threads={resolved} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** The ticket's PR tab's line comments, as a card, with Import beside the heading. */
export function TicketLineThreads({
  ticketId,
  discussion,
  replies,
}: {
  ticketId: number;
  discussion: DiscussionResponse;
  replies: PrReplies;
}): ReactElement {
  return (
    <LineThreads
      className={CARD_CLASS}
      threads={discussion.threads}
      imported={discussion.imported}
      replies={replies}
      diffIn="ticket"
      action={<ImportComments ticketId={ticketId} pullRequest={discussion.number} />}
    />
  );
}
