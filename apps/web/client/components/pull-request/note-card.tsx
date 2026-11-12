// A review summary or a conversation comment as a row with its author's avatar and Add to review. A
// line thread, its place a link to the diff; each with its replies below. And the discussion's
// shape while GitHub answers.

import { githubTitle } from '@union/core/github-text';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { PullRequestNote, PullRequestThread } from '../../../src/api-types';
import { openDiffLines, type DiffLines, type ReviewPageKind } from '../../lib/review/review-url';
import { formatWhen } from '../../lib/ui/relative-time';
import { Loading, SkeletonList } from '../ui/skeleton';
import { Badge, Button, CARD_CLASS } from '../ui/ui';
import { CommentBody } from './comment-body';
import { NoteAvatar } from './note-avatar';

const CARD =
  'space-y-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900';

const STATE_LABELS: Record<string, { label: string; tone: 'green' | 'red' | 'neutral' }> = {
  APPROVED: { label: 'approved', tone: 'green' },
  CHANGES_REQUESTED: { label: 'changes requested', tone: 'red' },
  COMMENTED: { label: 'review', tone: 'neutral' },
  DISMISSED: { label: 'dismissed', tone: 'neutral' },
};

function When({ at, url }: { at: string; url: string }): ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 text-zinc-500 hover:underline"
    >
      · {formatWhen(at)}
    </a>
  );
}

function NoteAction({
  imported,
  pending,
  onImport,
}: {
  imported: boolean;
  pending: boolean;
  onImport: (() => void) | undefined;
}): ReactElement | null {
  if (imported) {
    return <Badge tone="blue">in the review</Badge>;
  }
  return onImport ? (
    <Button size="sm" disabled={pending} onClick={onImport}>
      Add to review
    </Button>
  ) : null;
}

/** Who wrote the note and what it is; clicking it folds or unfolds the note. */
function NoteSummary({
  note,
  open,
  onToggle,
}: {
  note: PullRequestNote;
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  const state = note.state ? STATE_LABELS[note.state] : undefined;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex min-w-0 items-center gap-2 text-left"
    >
      <span className="truncate font-semibold">{note.author}</span>
      {note.bot ? <Badge tone="neutral">bot</Badge> : null}
      {note.kind === 'review' ? (
        <Badge tone={state?.tone ?? 'neutral'}>{state?.label ?? 'review'}</Badge>
      ) : null}
      <span aria-hidden className="text-zinc-400">
        {open ? '▾' : '▸'}
      </span>
    </button>
  );
}

/**
 * A review summary or a conversation comment as a row: its author's avatar, who and when, its first line
 * folded (a bot's starts folded) or all of it, and Add to review beside it.
 */
export function NoteCard({
  note,
  imported = false,
  pending = false,
  onImport,
  reply,
}: {
  note: PullRequestNote;
  imported?: boolean;
  pending?: boolean;
  /** Without it the note cannot be added to the review (a pull request reviewed without a ticket). */
  onImport?: () => void;
  /** Its replies and Quote reply; without it the note is read only. */
  reply?: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(!note.bot);
  return (
    <article className="flex gap-2.5 border-t border-zinc-200 pt-2.5 text-sm dark:border-zinc-800">
      <NoteAvatar login={note.author} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <header className="flex items-center gap-2 text-xs">
          <NoteSummary
            note={note}
            open={open}
            onToggle={() => {
              setOpen(!open);
            }}
          />
          <When at={note.createdAt} url={note.url} />
          <span className="ml-auto shrink-0">
            <NoteAction imported={imported} pending={pending} onImport={onImport} />
          </span>
        </header>
        {open ? (
          <>
            <CommentBody text={note.body} />
            {reply}
          </>
        ) : (
          <p className="truncate text-zinc-500">{githubTitle(note.body)}</p>
        )}
      </div>
    </article>
  );
}

/** The lines the thread is on: in the latest diff, else (outdated) where it was written. */
function threadLines(thread: PullRequestThread): DiffLines {
  const end = thread.line ?? thread.originalLine ?? 1;
  const start = thread.line === null ? thread.originalStartLine : thread.startLine;
  return { path: thread.path, side: thread.side, start: Math.min(start ?? end, end), end };
}

function place(thread: PullRequestThread): string {
  const line = thread.line ?? thread.originalLine;
  const start = thread.startLine ?? thread.originalStartLine;
  const range = start !== null && start !== line ? `${start}-${line}` : `${line ?? '?'}`;
  return `${thread.path}:${range}${thread.side === 'old' ? ' (removed)' : ''}`;
}

/** Where the thread sits; a link to those lines in the review's diff when there is one. */
function Place({
  thread,
  diffIn,
}: {
  thread: PullRequestThread;
  diffIn: ReviewPageKind | undefined;
}): ReactElement {
  if (!diffIn) {
    return <span className="font-mono">{place(thread)}</span>;
  }
  return (
    <button
      type="button"
      title={`Open ${thread.path} in the diff`}
      className="font-mono text-indigo-700 hover:underline dark:text-indigo-300"
      onClick={() => {
        openDiffLines(threadLines(thread), diffIn);
      }}
    >
      {place(thread)}
    </button>
  );
}

/** A line-comment thread: where it sits, then each comment, then its replies. */
export function ThreadCard({
  thread,
  imported = false,
  reply,
  diffIn,
}: {
  thread: PullRequestThread;
  imported?: boolean;
  /** Its replies and Reply; without it the thread is read only. */
  reply?: ReactNode;
  /** The review page whose Diff tab its place opens at its lines; without it the place is plain text. */
  diffIn?: ReviewPageKind;
}): ReactElement {
  const [first] = thread.comments;
  return (
    <article className={CARD}>
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <Place thread={thread} diffIn={diffIn} />
        {thread.resolved ? <Badge tone="green">resolved</Badge> : null}
        {thread.line === null ? <Badge tone="amber">outdated</Badge> : null}
        {imported ? <Badge tone="blue">in the review</Badge> : null}
        {first ? <When at={first.createdAt} url={first.url} /> : null}
      </header>
      {thread.comments.map((comment) => (
        <div key={comment.url} className="space-y-1">
          <p className="text-xs font-medium">@{comment.author}</p>
          <CommentBody text={comment.body} />
        </div>
      ))}
      {reply}
    </article>
  );
}

/** The discussion while GitHub answers: a card of comments taking shape, and why it waits. */
export function DiscussionLoading(): ReactElement {
  return (
    <section className={CARD_CLASS}>
      <h3 className="text-sm font-semibold">Discussion</h3>
      <Loading
        label="Reading the discussion"
        reason="Reading the pull request from GitHub"
        className="space-y-3.5"
      >
        <SkeletonList count={2} lines={2} />
      </Loading>
    </section>
  );
}
