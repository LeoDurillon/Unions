// The settings page's one Save, kept in view at the bottom, with whether something is unsaved.
import type { ReactElement, ReactNode } from 'react';

import type { SaveState } from '../../lib/use-settings-form';
import { Button, ErrorText } from '../ui';

function Status({ state }: { state: SaveState }): ReactElement | null {
  if (state.dirty) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
        <span aria-hidden className="size-2 rounded-full bg-amber-500" />
        Unsaved changes
      </span>
    );
  }
  if (state.saved) {
    return <span className="text-sm text-green-700 dark:text-green-400">Saved.</span>;
  }
  return null;
}

/**
 * Save and Discard for the whole page. `invalid` says why it cannot be saved as it is; `children`
 * are actions beside them that apply at once (turning previews off).
 */
export function SaveBar({
  state,
  label = 'Save',
  invalid,
  children,
}: {
  state: SaveState;
  label?: string;
  invalid?: string | null;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 space-y-2 border-t border-zinc-200 bg-zinc-50/95 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <ErrorText error={state.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Status state={state} />
        {state.dirty && invalid ? <span className="text-xs text-zinc-500">{invalid}</span> : null}
        <div className="ml-auto flex gap-2">
          {children}
          <Button
            disabled={!state.dirty || state.saving}
            onClick={() => {
              state.discard();
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            disabled={!state.dirty || state.saving || Boolean(invalid)}
            onClick={() => {
              state.save();
            }}
          >
            {state.saving ? 'Saving…' : label}
          </Button>
        </div>
      </div>
    </div>
  );
}
