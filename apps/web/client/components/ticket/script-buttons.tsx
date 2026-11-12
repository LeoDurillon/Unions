// The project's saved scripts, a chip each that runs it; without any, where to save them.

import type { ProjectScript } from '@union/core';
import type { ReactElement } from 'react';

import { openSettings } from '../../lib/settings/settings-sections';
import type { RunInput } from '../../lib/ticket/use-container-runs';

/** The project's saved scripts, a chip each that runs it; without any, where to save them. */
export function ScriptButtons({
  scripts,
  blocked,
  pending,
  onRun,
}: {
  scripts: readonly ProjectScript[];
  /** Why no command can run now, or null. */
  blocked: string | null;
  pending: boolean;
  onRun: (input: RunInput) => void;
}): ReactElement {
  if (scripts.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Commands you run often can be saved in{' '}
        <button
          type="button"
          className="text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            openSettings('scripts');
          }}
        >
          the project&apos;s scripts
        </button>
        .
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Saved scripts">
      {scripts.map((script) => (
        <button
          key={script.name}
          type="button"
          className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          disabled={blocked !== null || pending}
          title={blocked ?? script.command}
          onClick={() => {
            onRun({ scriptName: script.name });
          }}
        >
          <span aria-hidden className="mr-1 text-zinc-400">
            ▸
          </span>
          {script.name}
        </button>
      ))}
    </div>
  );
}
