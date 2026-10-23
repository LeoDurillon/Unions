// The project's saved scripts, one button each; without any, where to save them.
import type { ProjectScript } from '@union/core';
import type { ReactElement } from 'react';

import { openSettings } from '../lib/settings-sections';
import type { RunInput } from '../lib/use-container-runs';
import { Button } from './ui';

/** The project's saved scripts, one button each; without any, where to save them. */
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
    <div className="flex flex-wrap items-center gap-2" aria-label="Saved scripts">
      <span className="text-xs text-zinc-500">Scripts:</span>
      {scripts.map((script) => (
        <Button
          key={script.name}
          className="font-mono text-xs"
          disabled={blocked !== null || pending}
          title={blocked ?? script.command}
          onClick={() => {
            onRun({ scriptName: script.name });
          }}
        >
          {script.name}
        </Button>
      ))}
    </div>
  );
}
