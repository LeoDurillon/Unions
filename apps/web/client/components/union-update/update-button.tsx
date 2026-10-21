// The sidebar's Update entry: enabled when the checkout is behind `origin/main`, with Check now beside it.
import { useState, type ReactElement } from 'react';

import type { UnionUpdateView } from '../../../src/union-update-types';
import { useCheckForUpdate, useUnionUpdate } from '../../lib/use-union-update';
import { UpdateDialog } from './update-dialog';

type Update = NonNullable<UnionUpdateView['update']>;

/** The entry's text and title, and whether it opens the dialog. */
function stateOf(update: Update | null): { label: string; title: string; ready: boolean } {
  if (!update) {
    return { label: 'Checking for updates…', title: '', ready: false };
  }
  if (update.status === 'updating' || update.status === 'restarting') {
    return { label: 'Updating…', title: 'Union restarts when the pull is done', ready: false };
  }
  if (update.refusal) {
    return { label: 'Update unavailable', title: update.refusal, ready: false };
  }
  if (update.behind === 0) {
    const checked = new Date(update.checkedAt).toLocaleTimeString();
    return { label: 'Up to date', title: `Checked at ${checked}`, ready: false };
  }
  return {
    label: `Update (${update.behind})`,
    title: update.subjects.join('\n'),
    ready: true,
  };
}

function RefreshIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M15.3 4.7A7 7 0 0 0 3 10h2a5 5 0 0 1 8.9-3.1L12 9h5V4l-1.7.7ZM4.7 15.3A7 7 0 0 0 17 10h-2a5 5 0 0 1-8.9 3.1L8 11H3v5l1.7-.7Z" />
    </svg>
  );
}

export function UpdateButton(): ReactElement {
  const { data } = useUnionUpdate();
  const check = useCheckForUpdate();
  const [open, setOpen] = useState(false);
  const update = data?.update ?? null;
  const { label, title, ready } = stateOf(update);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!ready}
          title={title}
          onClick={() => {
            setOpen(true);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition enabled:hover:bg-zinc-200/70 disabled:text-zinc-500 dark:enabled:hover:bg-zinc-800"
        >
          {ready ? <span aria-hidden className="size-2 rounded-full bg-indigo-600" /> : null}
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          aria-label="Check for updates now"
          title="Check for updates now"
          disabled={check.isPending}
          onClick={() => {
            check.mutate();
          }}
          className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-200/70 disabled:opacity-50 dark:hover:bg-zinc-800"
        >
          <RefreshIcon />
        </button>
      </div>
      {update?.error ? (
        <p className="px-3 text-xs break-words text-red-600 dark:text-red-400">{update.error}</p>
      ) : null}
      {data ? (
        <UpdateDialog
          view={data}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
