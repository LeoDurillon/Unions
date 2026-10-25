// A pull request review's Comments tab: reviews and comments, then line comments, each with its replies.
import type { ReactElement } from 'react';

import type { PullRequestNote } from '../../../src/api-types';
import { reviewBase, type ReviewTarget } from '../../lib/review-target';
import { reviewRepliesBase, usePrReplies, type PrReplies } from '../../lib/use-pr-replies';
import { useReviewDiscussion } from '../../lib/use-review';
import { NoteCard, ThreadCard } from '../pull-request/note-card';
import { filterNotes, NoteFilterControl, useNoteFilter } from '../pull-request/note-filter';
import { ReplyArea } from '../pull-request/reply-area';
import { ReviewLoading } from './review-description';

function Notes({ notes, replies }: { notes: PullRequestNote[]; replies: PrReplies }): ReactElement {
  const [filter, setFilter] = useNoteFilter();
  const shown = filterNotes(notes, filter);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Reviews and comments</h3>
        <NoteFilterControl notes={notes} value={filter} onChange={setFilter} />
      </div>
      {shown.length === 0 ? <p className="text-sm text-zinc-500">None.</p> : null}
      {shown.map((note) => (
        <NoteCard
          key={note.url}
          note={note}
          reply={
            <ReplyArea
              replies={replies}
              target={{ kind: 'note', url: note.url }}
              githubUrl={note.url}
              quote={note}
            />
          }
        />
      ))}
    </section>
  );
}

/** What was said on the pull request: reviews and comments, then line comments, each to reply to. */
export function ReviewCommentsTab({
  target,
  number,
}: {
  target: ReviewTarget;
  number: number;
}): ReactElement {
  const discussion = useReviewDiscussion(target);
  const replies = usePrReplies(reviewRepliesBase(reviewBase(target)), number, discussion.refetch);
  if (!discussion.data) {
    return <ReviewLoading error={discussion.error} />;
  }
  const { notes, threads } = discussion.data;
  return (
    <div className="space-y-6">
      <Notes notes={notes} replies={replies} />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Line comments ({threads.length})</h3>
        {threads.length === 0 ? <p className="text-sm text-zinc-500">None.</p> : null}
        {threads.map((thread) => (
          <ThreadCard
            key={thread.comments[0]?.url ?? thread.path}
            thread={thread}
            reply={
              <ReplyArea
                replies={replies}
                target={{ kind: 'thread', threadId: thread.id }}
                githubUrl={thread.comments[0]?.url}
              />
            }
          />
        ))}
      </section>
    </div>
  );
}
