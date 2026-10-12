import { githubText } from '@union/core/github-text';
import { useState, type ReactElement } from 'react';

import type { PullRequestNote, PullRequestThread } from '../../../src/api-types';
import { Markdown } from '../markdown';
import { Badge, Button } from '../ui';

/** Longer bodies (bot reports, walkthroughs) start folded. */
const FOLD_AT = 600;

const STATE_LABELS: Record<string, { label: string; tone: 'green' | 'red' | 'neutral' }> = {
  APPROVED: { label: 'approved', tone: 'green' },
  CHANGES_REQUESTED: { label: 'changes requested', tone: 'red' },
  COMMENTED: { label: 'review', tone: 'neutral' },
  DISMISSED: { label: 'dismissed', tone: 'neutral' },
};

function Body({ text }: { text: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const long = text.length > FOLD_AT;
  return (
    <div>
      <div className={long && !open ? 'max-h-40 overflow-hidden' : ''}>
        <Markdown>{githubText(text)}</Markdown>
      </div>
      {long ? (
        <button
          type="button"
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      ) : null}
    </div>
  );
}

function When({ at, url }: { at: string; url: string }): ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-auto text-zinc-500 hover:underline"
    >
      {new Date(at).toLocaleString()}
    </a>
  );
}

/** A review summary or a conversation comment, with its Add to review action. */
export function NoteCard({
  note,
  imported,
  pending,
  onImport,
}: {
  note: PullRequestNote;
  imported: boolean;
  pending: boolean;
  onImport: () => void;
}): ReactElement {
  const state = note.state ? STATE_LABELS[note.state] : undefined;
  return (
    <article className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">@{note.author}</span>
        {note.bot ? <Badge tone="neutral">bot</Badge> : null}
        {note.kind === 'review' ? (
          <Badge tone={state?.tone ?? 'neutral'}>{state?.label ?? 'review'}</Badge>
        ) : null}
        <When at={note.createdAt} url={note.url} />
      </header>
      <Body text={note.body} />
      {imported ? (
        <Badge tone="blue">in the review</Badge>
      ) : (
        <Button disabled={pending} onClick={onImport}>
          Add to review
        </Button>
      )}
    </article>
  );
}

function place(thread: PullRequestThread): string {
  const line = thread.line ?? thread.originalLine;
  const start = thread.startLine ?? thread.originalStartLine;
  const range = start !== null && start !== line ? `${start}-${line}` : `${line ?? '?'}`;
  return `${thread.path}:${range}${thread.side === 'old' ? ' (removed)' : ''}`;
}

/** A line-comment thread: where it sits, then each comment. */
export function ThreadCard({
  thread,
  imported,
}: {
  thread: PullRequestThread;
  imported: boolean;
}): ReactElement {
  const [first] = thread.comments;
  return (
    <article className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono">{place(thread)}</span>
        {thread.resolved ? <Badge tone="green">resolved</Badge> : null}
        {thread.line === null ? <Badge tone="amber">outdated</Badge> : null}
        {imported ? <Badge tone="blue">in the review</Badge> : null}
        {first ? <When at={first.createdAt} url={first.url} /> : null}
      </header>
      {thread.comments.map((comment) => (
        <div key={comment.url} className="space-y-1">
          <p className="text-xs font-medium">@{comment.author}</p>
          <Body text={comment.body} />
        </div>
      ))}
    </article>
  );
}
