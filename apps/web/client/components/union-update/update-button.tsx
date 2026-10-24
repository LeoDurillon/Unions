// The sidebar's Update entry: prominent when the checkout is behind `origin/main`, else a quiet line;
// Check now beside it.
import { useState, type ReactElement } from 'react';

import type { UnionUpdateView } from '../../../src/union-update-types';
import { useCheckNow, useUnionUpdate } from '../../lib/use-union-update';
import { SIDE_LABEL } from '../sidebar-classes';
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

function RefreshIcon({ spinning }: { spinning: boolean }): ReactElement {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`size-4 ${spinning ? 'animate-spin' : ''}`}
    >
      <path d="M15.3 4.7A7 7 0 0 0 3 10h2a5 5 0 0 1 8.9-3.1L12 9h5V4l-1.7.7ZM4.7 15.3A7 7 0 0 0 17 10h-2a5 5 0 0 1-8.9 3.1L8 11H3v5l1.7-.7Z" />
    </svg>
  );
}

/** Checks the remote again; disabled, its arrow turning, while a check or an update runs. */
function CheckNowButton({ update }: { update: Update | null }): ReactElement {
  const check = useCheckNow(update?.checkedAt ?? null);
  const updating = update?.status === 'updating' || update?.status === 'restarting';
  const busy = check.checking || updating;
  return (
    <button
      type="button"
      aria-label={check.checking ? 'Checking for updates' : 'Check for updates now'}
      title={check.checking ? 'Checking for updates…' : 'Check for updates now'}
      aria-busy={check.checking}
      disabled={busy}
      onClick={() => {
        check.start();
      }}
      className={`rounded-md p-2 text-zinc-500 transition enabled:hover:bg-zinc-200/70 disabled:cursor-not-allowed dark:enabled:hover:bg-zinc-800 ${check.checking ? '' : 'disabled:opacity-50'}`}
    >
      <RefreshIcon spinning={check.checking} />
    </button>
  );
}

export function UpdateButton(): ReactElement {
  const { data } = useUnionUpdate();
  const [open, setOpen] = useState(false);
  const update = data?.update ?? null;
  const { label, title, ready } = stateOf(update);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 group-data-[compact]/side:flex-col">
        <button
          type="button"
          disabled={!ready}
          title={title}
          onClick={() => {
            setOpen(true);
          }}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 text-left transition enabled:hover:bg-zinc-200/70 disabled:text-zinc-400 dark:enabled:hover:bg-zinc-800 dark:disabled:text-zinc-500 ${ready ? 'py-2 text-sm font-medium group-data-[compact]/side:justify-center group-data-[compact]/side:px-0' : 'py-1 text-xs group-data-[compact]/side:hidden'}`}
        >
          {ready ? <span aria-hidden className="size-2 rounded-full bg-indigo-600" /> : null}
          <span className={SIDE_LABEL}>{label}</span>
        </button>
        <CheckNowButton update={update} />
      </div>
      {update?.error ? (
        <p className="px-3 text-xs break-words text-red-600 group-data-[compact]/side:hidden dark:text-red-400">
          {update.error}
        </p>
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
