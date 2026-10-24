// The specs an agent action will read, as a short list, with a link to edit them (the Specs bar's dialog).
import type { AgentReviewSpec } from '@union/core';
import type { ReactElement } from 'react';

import { useSpecsEditing } from './specs-editing';

/** `specs` null while read; `onEdit` closes the action's dialog before the specs dialog opens. */
export function SpecSummary({
  specs,
  onEdit,
}: {
  specs: AgentReviewSpec[] | null;
  onEdit: () => void;
}): ReactElement {
  const editing = useSpecsEditing();
  const edit = editing ? (
    <button
      type="button"
      className="text-indigo-600 hover:underline dark:text-indigo-400"
      onClick={() => {
        onEdit();
        editing.setEditing(true);
      }}
    >
      Edit the specs
    </button>
  ) : null;
  if (specs === null) {
    return <p className="text-sm text-zinc-500">Reading the specs…</p>;
  }
  return (
    <div className="space-y-1 text-sm">
      {specs.length === 0 ? (
        <p className="text-zinc-500">No spec: the agent reads the change alone.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5">
          {specs.map((spec) => (
            <li key={spec.label}>
              {spec.label}
              {spec.prs.length > 1 ? (
                <span className="text-xs text-zinc-500">
                  {' '}
                  ({spec.prs.map((number) => `#${number}`).join(', ')})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {edit}
    </div>
  );
}
