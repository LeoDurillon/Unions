// The review's specs under its header: one chip each (edited ones marked, unreadable ones in red),
// and Edit, which opens the dialog that changes them for every agent action.
import type { ReactElement } from 'react';

import type { ReviewSpecView } from '../../../src/review-spec-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewSpecs } from '../../lib/use-review-specs';
import { specSources } from './spec-picker';
import { SpecsDialog } from './specs-dialog';
import { useSpecsEditing } from './specs-editing';

function Chip({ spec }: { spec: ReviewSpecView }): ReactElement {
  const failed = spec.error !== null;
  const title = failed ? `Could not read it: ${spec.error}` : spec.label;
  return (
    <span
      title={title}
      className={`inline-flex max-w-72 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${failed ? 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-400' : 'border-zinc-300 dark:border-zinc-700'}`}
    >
      <span className="truncate">{spec.label}</span>
      {spec.text === null ? null : (
        <span className="text-amber-700 dark:text-amber-400">· edited</span>
      )}
    </span>
  );
}

/** The specs as chips, and Edit, which opens the dialog (its state is the page's: `useSpecsEditing`). */
export function SpecsBar({
  target,
  hasPullRequest,
}: {
  target: ReviewTarget;
  hasPullRequest: boolean;
}): ReactElement {
  const { list } = useReviewSpecs(target);
  const editing = useSpecsEditing();
  const shown = (list.data ?? []).filter((spec) => !spec.removed);
  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-1.5 dark:border-zinc-800">
      <span className="text-xs font-medium text-zinc-500">Specs</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {list.data === undefined ? (
          <span className="text-xs text-zinc-500">
            {list.error ? list.error.message : 'Reading…'}
          </span>
        ) : null}
        {list.data !== undefined && shown.length === 0 ? (
          <span className="text-xs text-zinc-500">None: the agents read the change alone.</span>
        ) : null}
        {shown.map((spec) => (
          <Chip key={`${spec.kind}:${spec.ref ?? spec.label}`} spec={spec} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          editing?.setEditing(true);
        }}
        className="rounded-md px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
      >
        Edit
      </button>
      {editing?.editing ? (
        <SpecsDialog
          target={target}
          sources={specSources(target, hasPullRequest)}
          onClose={() => {
            editing.setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}
