// The template variables as chips: clicking one adds it to the text being written.
import { TEMPLATE_VARIABLES } from '@union/core/event-rules';
import type { ReactElement } from 'react';

export function VariableChips({ onPick }: { onPick: (variable: string) => void }): ReactElement {
  return (
    <span className="flex flex-wrap gap-1">
      {TEMPLATE_VARIABLES.map((variable) => (
        <button
          key={variable.name}
          type="button"
          title={variable.description}
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs hover:bg-indigo-100 dark:bg-zinc-800 dark:hover:bg-indigo-950"
          onClick={() => {
            onPick(`{${variable.name}}`);
          }}
        >
          {`{${variable.name}}`}
        </button>
      ))}
    </span>
  );
}
