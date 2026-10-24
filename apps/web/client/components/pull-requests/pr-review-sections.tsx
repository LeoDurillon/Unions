// The tabs a pull request review shows before its diff; Notion once it is linked to a page.
import type { ReactElement } from 'react';

import type { CurrentReview, PullRequestNote } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewDiscussion } from '../../lib/use-review';
import { NoteCard, ThreadCard } from '../pull-request/note-card';
import { filterNotes, NoteFilterControl, useNoteFilter } from '../pull-request/note-filter';
import type { ReviewSection } from '../review/review-page';
import { ReviewDescription, ReviewLoading } from './review-description';
import { ReviewNotionTab } from './review-notion-tab';

function Notes({ notes }: { notes: PullRequestNote[] }): ReactElement {
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
        <NoteCard key={note.url} note={note} />
      ))}
    </section>
  );
}

/** What was said on the pull request: reviews and comments, then line comments (read only). */
function Comments({ target }: { target: ReviewTarget }): ReactElement {
  const discussion = useReviewDiscussion(target);
  if (!discussion.data) {
    return <ReviewLoading error={discussion.error} />;
  }
  const { notes, threads } = discussion.data;
  return (
    <div className="space-y-6">
      <Notes notes={notes} />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Line comments ({threads.length})</h3>
        {threads.length === 0 ? <p className="text-sm text-zinc-500">None.</p> : null}
        {threads.map((thread) => (
          <ThreadCard key={thread.comments[0]?.url ?? thread.path} thread={thread} />
        ))}
      </section>
    </div>
  );
}

/** The tabs a pull request review shows before its diff; Notion once it is linked to a page. */
export function prReviewSections(target: ReviewTarget, review: CurrentReview): ReviewSection[] {
  const count = review.notionPages.length;
  const notion: ReviewSection[] =
    count > 0
      ? [
          {
            id: 'notion',
            label: count > 1 ? `Notion (${count})` : 'Notion',
            content: <ReviewNotionTab review={review} />,
          },
        ]
      : [];
  return [
    {
      id: 'description',
      label: 'Description',
      content: <ReviewDescription target={target} review={review} />,
    },
    ...notion,
    { id: 'comments', label: 'Comments', content: <Comments target={target} /> },
  ];
}
