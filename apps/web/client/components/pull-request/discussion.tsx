import { useState, type ReactElement } from 'react';

import type { CommentView, DiscussionResponse } from '../../../src/api-types';
import { useCommentMutations, useComments, useDiscussion } from '../../lib/use-review';
import { CommentCard } from '../review/comment-card';
import { ImportComments } from '../review/import-comments';
import { ErrorText } from '../ui';
import { NoteCard, ThreadCard } from './note-card';

type Mutations = ReturnType<typeof useCommentMutations>;

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
  hideBots,
  mutations,
}: {
  discussion: DiscussionResponse;
  hideBots: boolean;
  mutations: Mutations;
}): ReactElement {
  const notes = discussion.notes.filter((note) => !(hideBots && note.bot));
  const { importNote } = mutations;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Reviews and comments ({notes.length})</h3>
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
  discussion,
  mutations,
}: {
  discussion: DiscussionResponse;
  mutations: Mutations;
}): ReactElement {
  const { threads } = discussion;
  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">Line comments ({threads.length})</h3>
        {threads.length > 0 ? (
          <ImportComments pullRequest={discussion.number} mutations={mutations} />
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

/** The pull request's GitHub discussion, and what of it goes to the implementer. */
export function Discussion({ ticketId }: { ticketId: number }): ReactElement {
  const discussion = useDiscussion(ticketId, true);
  const comments = useComments(ticketId);
  const mutations = useCommentMutations(ticketId);
  const [hideBots, setHideBots] = useState(false);
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
      <label className="flex items-center gap-2 text-sm text-zinc-500">
        <input
          type="checkbox"
          checked={hideBots}
          onChange={(event) => {
            setHideBots(event.target.checked);
          }}
        />
        Hide bots
      </label>
      <Notes discussion={discussion.data} hideBots={hideBots} mutations={mutations} />
      <Threads discussion={discussion.data} mutations={mutations} />
    </div>
  );
}
