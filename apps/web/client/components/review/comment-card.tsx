import { useState, type ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import { Badge, Button, inputClass } from '../ui';

function lines(comment: CommentView): string {
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
      {comment.outdated ? <Badge tone="amber">outdated</Badge> : null}
    </div>
  );
}

function DraftActions({
  editing,
  canSave,
  onEdit,
  onSave,
  onDelete,
}: {
  editing: boolean;
  canSave: boolean;
  onEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
}): ReactElement {
  return (
    <div className="flex gap-2">
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

/** One comment: drafts can be edited or deleted; sent ones are read-only. */
export function CommentCard({
  comment,
  onSave,
  onDelete,
  showExcerpt = false,
}: {
  comment: CommentView;
  onSave: (body: string) => void;
  onDelete: () => void;
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
        <p className="whitespace-pre-wrap">{comment.body}</p>
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
        />
      ) : null}
    </div>
  );
}
