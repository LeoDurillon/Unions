// One comment: drafts can be edited or deleted, the agent's suggestions also kept as they are; sent
// ones are read-only.
import { useState, type ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { useCommentMutations } from '../../lib/use-review';
import { Markdown } from '../markdown';
import { Badge, Button, inputClass } from '../ui';

function lines(comment: CommentView): string {
  if (comment.kind === 'general') {
    return 'whole pull request';
  }
  const range =
    comment.startLine === comment.endLine
      ? `line ${comment.startLine}`
      : `lines ${comment.startLine}-${comment.endLine}`;
  return comment.side === 'old' ? `${range} (removed)` : range;
}

function CommentHeader({ comment }: { comment: CommentView }): ReactElement {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span>{lines(comment)}</span>
      {comment.status === 'draft' ? (
        <Badge tone="blue">draft</Badge>
      ) : (
        <Badge tone="neutral">sent</Badge>
      )}
      {comment.status === 'draft' && comment.author === 'agent' ? (
        <Badge tone="amber">suggested by the agent</Badge>
      ) : null}
      {comment.outdated ? <Badge tone="amber">outdated</Badge> : null}
      {comment.githubUrl ? (
        <a
          href={comment.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-indigo-600 hover:underline dark:text-indigo-400"
        >
          on GitHub
        </a>
      ) : null}
    </div>
  );
}

function CommentText({ comment }: { comment: CommentView }): ReactElement {
  if (comment.githubUrl) {
    // Imported from GitHub, where it was written as markdown.
    return <Markdown>{comment.body}</Markdown>;
  }
  return <p className="whitespace-pre-wrap">{comment.body}</p>;
}

function DraftActions({
  editing,
  canSave,
  onEdit,
  onSave,
  onDelete,
  onKeep,
}: {
  editing: boolean;
  canSave: boolean;
  onEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  /** Only for the agent's suggestions: keeps one as is. */
  onKeep: (() => void) | null;
}): ReactElement {
  return (
    <div className="flex gap-2">
      {onKeep && !editing ? <Button onClick={onKeep}>Keep</Button> : null}
      {editing ? (
        <Button disabled={!canSave} onClick={onSave}>
          Save
        </Button>
      ) : (
        <Button onClick={onEdit}>Edit</Button>
      )}
      <Button onClick={onDelete}>Delete</Button>
    </div>
  );
}

/**
 * One comment: drafts can be edited or deleted, the agent's suggestions also kept as they are; sent
 * ones are read-only.
 */
export function CommentCard({
  comment,
  onSave,
  onDelete,
  onKeep,
  showExcerpt = false,
}: {
  comment: CommentView;
  onSave: (body: string) => void;
  onDelete: () => void;
  onKeep?: () => void;
  showExcerpt?: boolean;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  return (
    <div className="space-y-2 rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <CommentHeader comment={comment} />
      {showExcerpt ? (
        <pre className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
          {comment.excerpt}
        </pre>
      ) : null}
      {editing ? (
        <textarea
          className={`${inputClass} min-h-20`}
          value={body}
          aria-label="Edit comment"
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      ) : (
        <CommentText comment={comment} />
      )}
      {comment.status === 'draft' ? (
        <DraftActions
          editing={editing}
          canSave={body.trim() !== ''}
          onEdit={() => {
            setEditing(true);
          }}
          onSave={() => {
            onSave(body);
            setEditing(false);
          }}
          onDelete={onDelete}
          onKeep={comment.author === 'agent' && onKeep ? onKeep : null}
        />
      ) : null}
    </div>
  );
}

/** A comment wired to the review's writes. */
export function ReviewCommentCard({
  comment,
  mutations,
  showExcerpt = false,
}: {
  comment: CommentView;
  mutations: ReturnType<typeof useCommentMutations>;
  showExcerpt?: boolean;
}): ReactElement {
  return (
    <CommentCard
      comment={comment}
      showExcerpt={showExcerpt}
      onSave={(body) => {
        mutations.edit.mutate({ id: comment.id, body });
      }}
      onDelete={() => {
        mutations.remove.mutate(comment.id);
      }}
      onKeep={() => {
        mutations.keep.mutate(comment.id);
      }}
    />
  );
}
