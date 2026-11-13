// The pull request's GitHub discussion (`pr`: the ticket's or a slice's), and what of it goes to
// the implementer.

import type { ReactElement } from 'react';

import type { CommentView, DiscussionResponse } from '../../../src/api-types';
import {
  ticketRepliesBase,
  usePrReplies,
  type PrReplies,
} from '../../lib/pull-request/use-pr-replies';
import {
  useCommentMutations,
  useComments,
  useDiscussion,
  useImportMutations,
} from '../../lib/review/use-review';
import { CommentCard } from '../review/comment-card';
import { CARD_CLASS, ErrorText } from '../ui/ui';
import { LineThreads } from './line-threads';
import { DiscussionLoading, NoteCard } from './note-card';
import { filterNotes, NoteFilterControl, useNoteFilter } from './note-filter';
import { ReplyArea, SendAllReplies } from './reply-area';

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
  const general = comments.filter(
    (comment) => comment.kind === 'general' && comment.status === 'draft',
  );
  if (general.length === 0) {
    return null;
  }
  return (
    <section className={CARD_CLASS}>
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
  replies,
}: {
  discussion: DiscussionResponse;
  importNote: ImportNote;
  replies: PrReplies;
}): ReactElement {
  const [filter, setFilter] = useNoteFilter();
  const notes = filterNotes(discussion.notes, filter);
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Discussion on GitHub</h3>
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

/** The pull request's GitHub discussion (`pr`: the ticket's or a slice's), and what of it goes to the implementer. */
export function Discussion({ ticketId, pr }: { ticketId: number; pr: number }): ReactElement {
  const discussion = useDiscussion(ticketId, pr, true);
  const target = { kind: 'ticket', ticketId } as const;
  const comments = useComments(target);
  const mutations = useCommentMutations(target);
  const { importNote } = useImportMutations(ticketId, pr);
  const replies = usePrReplies(ticketRepliesBase(ticketId), pr, discussion.refetch, `?pr=${pr}`);
  if (!discussion.data) {
    return discussion.error ? <ErrorText error={discussion.error} /> : <DiscussionLoading />;
  }
  return (
    <div className="space-y-4">
      <SendAllReplies replies={replies} />
      <ImportedDrafts comments={comments.data ?? []} mutations={mutations} />
      <LineThreads ticketId={ticketId} discussion={discussion.data} replies={replies} />
      <Notes discussion={discussion.data} importNote={importNote} replies={replies} />
    </div>
  );
}
