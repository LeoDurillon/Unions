// One comment: drafts can be edited or deleted, the agent's suggestions also kept as they are; sent
// ones are read-only.

import { isJiraCommentUrl } from '@union/core/jira-comment-link';
import { isNotionUrl } from '@union/core/notion-discussion-link';
import { useState, type ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { useCommentMutations } from '../../lib/review/use-review';
import { onModEnter } from '../../lib/ui/mod-enter';
import { Markdown } from '../markdown/markdown';
import { ConfirmButton } from '../ui/confirm-button';
import { Badge, Button, inputClass } from '../ui/ui';

/** Where an imported comment comes from, as its link reads. */
function sourceLabel(url: string): string {
  if (isNotionUrl(url)) {
    return 'on Notion';
  }
  return isJiraCommentUrl(url) ? 'on Jira' : 'on GitHub';
}

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
      {comment.sourceUrl ? (
        <a
          href={comment.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {sourceLabel(comment.sourceUrl)}
        </a>
      ) : null}
    </div>
  );
}

function CommentText({ comment }: { comment: CommentView }): ReactElement {
  if (comment.sourceUrl) {
    // Imported from GitHub or Notion, where it was written as markdown.
    return <Markdown>{comment.body}</Markdown>;
  }
  return <p className="whitespace-pre-wrap">{comment.body}</p>;
}

/** The draft's text while edited; Ctrl/⌘+Enter saves. */
function EditBox({
  body,
  canSave,
  onChange,
  onSave,
}: {
  body: string;
  canSave: boolean;
  onChange: (body: string) => void;
  onSave: () => void;
}): ReactElement {
  return (
    <textarea
      className={`${inputClass} min-h-20`}
      value={body}
      aria-label="Edit comment"
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onKeyDown={onModEnter(onSave, canSave)}
    />
  );
}

/** Which of a draft's writes is under way: its buttons wait for it. */
type CommentBusy = { saving: boolean; deleting: boolean; keeping: boolean };

const IDLE: CommentBusy = { saving: false, deleting: false, keeping: false };

function DraftActions({
  editing,
  canSave,
  busy,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onKeep,
}: {
  editing: boolean;
  canSave: boolean;
  busy: CommentBusy;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Only for the agent's suggestions: keeps one as is. */
  onKeep: (() => void) | null;
}): ReactElement {
  const any = busy.saving || busy.deleting || busy.keeping;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onKeep && !editing ? (
        <Button disabled={any} onClick={onKeep}>
          {busy.keeping ? 'Keeping…' : 'Keep'}
        </Button>
      ) : null}
      {editing ? (
        <>
          <Button disabled={!canSave || any} onClick={onSave}>
            {busy.saving ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </>
      ) : (
        <Button disabled={any} onClick={onEdit}>
          Edit
        </Button>
      )}
      <ConfirmButton
        label={busy.deleting ? 'Deleting…' : 'Delete'}
        name="Delete this comment"
        question="Delete this draft comment?"
        confirmLabel="Delete"
        disabled={any}
        onConfirm={onDelete}
      />
    </div>
  );
}

/**
 * One comment: drafts can be edited or deleted, the agent's suggestions also kept as they are; sent
 * ones are read-only.
 */
function CommentCard({
  comment,
  onSave,
  onDelete,
  onKeep,
  busy = IDLE,
  showExcerpt = false,
}: {
  comment: CommentView;
  onSave: (body: string) => void;
  onDelete: () => void;
  onKeep?: () => void;
  busy?: CommentBusy;
  showExcerpt?: boolean;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const canSave = body.trim() !== '' && !busy.saving;
  const save = (): void => {
    onSave(body);
    setEditing(false);
  };
  return (
    <div className="space-y-2 rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <CommentHeader comment={comment} />
      {showExcerpt ? (
        <pre className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
          {comment.excerpt}
        </pre>
      ) : null}
      {editing ? (
        <EditBox body={body} canSave={canSave} onChange={setBody} onSave={save} />
      ) : (
        <CommentText comment={comment} />
      )}
      {comment.status === 'draft' ? (
        <DraftActions
          editing={editing}
          canSave={canSave}
          busy={busy}
          onEdit={() => {
            setBody(comment.body);
            setEditing(true);
          }}
          onSave={save}
          onCancel={() => {
            setBody(comment.body);
            setEditing(false);
          }}
          onDelete={onDelete}
          onKeep={comment.author === 'agent' && onKeep ? onKeep : null}
        />
      ) : null}
    </div>
  );
}

/** Which writes of `mutations` are under way for the comment `id`. */
function commentBusy(mutations: ReturnType<typeof useCommentMutations>, id: number): CommentBusy {
  return {
    saving: mutations.edit.isPending && mutations.edit.variables.id === id,
    deleting: mutations.remove.isPending && mutations.remove.variables === id,
    keeping: mutations.keep.isPending && mutations.keep.variables === id,
  };
}

/** A comment wired to the review's writes. */
export function ReviewCommentCard({
  comment,
  mutations,
  showExcerpt = false,
  keepable = true,
}: {
  comment: CommentView;
  mutations: ReturnType<typeof useCommentMutations>;
  showExcerpt?: boolean;
  /** Offer Keep on the agent's suggestions; off where they are not reviewed (the PR's discussion). */
  keepable?: boolean;
}): ReactElement {
  return (
    <CommentCard
      comment={comment}
      showExcerpt={showExcerpt}
      busy={commentBusy(mutations, comment.id)}
      onSave={(body) => {
        mutations.edit.mutate({ id: comment.id, body });
      }}
      onDelete={() => {
        mutations.remove.mutate(comment.id);
      }}
      onKeep={
        keepable
          ? () => {
              mutations.keep.mutate(comment.id);
            }
          : undefined
      }
    />
  );
}
