// A pull request review's Comments tab: line comments (resolved ones folded), then reviews and comments, with replies.

import type { ReactElement } from 'react';

import type { PullRequestNote } from '../../../src/api-types';
import {
  reviewRepliesBase,
  usePrReplies,
  type PrReplies,
} from '../../lib/pull-request/use-pr-replies';
import { reviewBase, type ReviewTarget } from '../../lib/review/review-target';
import { useReviewDiscussion } from '../../lib/review/use-review';
import { LineThreads } from '../pull-request/line-threads';
import { NoteCard } from '../pull-request/note-card';
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

/** What was said on the pull request: line comments, then reviews and comments, each to reply to. */
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
      <LineThreads
        className="space-y-2"
        threads={threads}
        replies={replies}
        diffIn="pull-request"
      />
      <Notes notes={notes} replies={replies} />
    </div>
  );
}
