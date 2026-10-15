import { githubText } from '@union/core/github-text';
import type { ReactElement } from 'react';

import type { PullRequestNote } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewDiscussion } from '../../lib/use-review';
import { Markdown } from '../markdown';
import { NoteCard, ThreadCard } from '../pull-request/note-card';
import { filterNotes, NoteFilterControl, useNoteFilter } from '../pull-request/note-filter';
import type { ReviewSection } from '../review/review-page';
import { ErrorText } from '../ui';

function Loading({ error }: { error: Error | null }): ReactElement {
  return error ? (
    <ErrorText error={error} />
  ) : (
    <p className="text-sm text-zinc-500">Reading the pull request on GitHub…</p>
  );
}

/** The pull request's own description, as written on GitHub. */
function Description({ target }: { target: ReviewTarget }): ReactElement {
  const discussion = useReviewDiscussion(target);
  if (!discussion.data) {
    return <Loading error={discussion.error} />;
  }
  const text = githubText(discussion.data.description);
  return text === '' ? (
    <p className="text-sm text-zinc-500">No description.</p>
  ) : (
    <Markdown>{text}</Markdown>
  );
}

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
    return <Loading error={discussion.error} />;
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

/** The tabs a pull request review shows before its diff. */
export function prReviewSections(target: ReviewTarget): ReviewSection[] {
  return [
    { id: 'description', label: 'Description', content: <Description target={target} /> },
    { id: 'comments', label: 'Comments', content: <Comments target={target} /> },
  ];
}
