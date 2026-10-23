// The pull request's GitHub discussion (`pr`: the ticket's or a slice's), and what of it goes to
// the implementer.
import type { ReactElement } from 'react';

import type { CommentView, DiscussionResponse } from '../../../src/api-types';
import {
  useCommentMutations,
  useComments,
  useDiscussion,
  useImportMutations,
} from '../../lib/use-review';
import { CommentCard } from '../review/comment-card';
import { ImportComments } from '../review/import-comments';
import { ErrorText } from '../ui';
import { NoteCard, ThreadCard } from './note-card';
import { filterNotes, NoteFilterControl, useNoteFilter } from './note-filter';

type Mutations = ReturnType<typeof useCommentMutations>;
type ImportNote = ReturnType<typeof useImportMutations>['importNote'];

/** The drafts taken from the pull request, editable here; they leave with the next Send review. */
function ImportedDrafts({
  comments,
  mutations,
}: {
  comments: CommentView[];
  mutations: Mutations;
}): ReactElement | null {
  const general = comments.filter((comment) => comment.kind === 'general');
  if (general.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">In the review</h3>
      <p className="text-xs text-zinc-500">
        Sent to the implementer with the line comments, from Review changes → Send review.
      </p>
      {general.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          onSave={(body) => {
            mutations.edit.mutate({ id: comment.id, body });
          }}
          onDelete={() => {
            mutations.remove.mutate(comment.id);
          }}
        />
      ))}
    </section>
  );
}

function Notes({
  discussion,
  importNote,
}: {
  discussion: DiscussionResponse;
  importNote: ImportNote;
}): ReactElement {
  const [filter, setFilter] = useNoteFilter();
  const notes = filterNotes(discussion.notes, filter);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Reviews and comments</h3>
        <NoteFilterControl notes={discussion.notes} value={filter} onChange={setFilter} />
      </div>
      <ErrorText error={importNote.error} />
      {notes.length === 0 ? <p className="text-sm text-zinc-500">None.</p> : null}
      {notes.map((note) => (
        <NoteCard
          key={note.url}
          note={note}
          imported={discussion.imported.includes(note.url)}
          pending={importNote.isPending}
          onImport={() => {
            importNote.mutate(note.url);
          }}
        />
      ))}
    </section>
  );
}

function Threads({
  ticketId,
  discussion,
}: {
  ticketId: number;
  discussion: DiscussionResponse;
}): ReactElement {
  const { threads } = discussion;
  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">Line comments ({threads.length})</h3>
        {threads.length > 0 ? (
          <ImportComments ticketId={ticketId} pullRequest={discussion.number} />
        ) : null}
      </div>
      {threads.length === 0 ? <p className="text-sm text-zinc-500">None.</p> : null}
      {threads.map((thread) => (
        <ThreadCard
          key={thread.comments[0]?.url ?? thread.path}
          thread={thread}
          imported={discussion.imported.includes(thread.comments[0]?.url ?? '')}
        />
      ))}
    </section>
  );
}

/** The pull request's GitHub discussion (`pr`: the ticket's or a slice's), and what of it goes to the implementer. */
export function Discussion({ ticketId, pr }: { ticketId: number; pr: number }): ReactElement {
  const discussion = useDiscussion(ticketId, pr, true);
  const target = { kind: 'ticket', ticketId } as const;
  const comments = useComments(target);
  const mutations = useCommentMutations(target);
  const { importNote } = useImportMutations(ticketId, pr);
  if (!discussion.data) {
    return discussion.error ? (
      <ErrorText error={discussion.error} />
    ) : (
      <p className="text-sm text-zinc-500">Reading the discussion on GitHub…</p>
    );
  }
  return (
    <div className="space-y-6">
      <ImportedDrafts comments={comments.data ?? []} mutations={mutations} />
      <Notes discussion={discussion.data} importNote={importNote} />
      <Threads ticketId={ticketId} discussion={discussion.data} />
    </div>
  );
}
