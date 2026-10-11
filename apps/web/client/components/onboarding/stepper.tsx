import type { ReactElement } from 'react';

import { STEPS } from './draft';

/** Numbered progress bar across the top of the wizard. */
export function Stepper({ current }: { current: number }): ReactElement {
  return (
    <ol className="flex w-full items-center justify-center gap-2 text-sm">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const dot =
          active || done
            ? 'bg-indigo-600 text-white'
            : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
        return (
          <li key={step.label} className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${dot}`}
            >
              {done ? '✓' : index + 1}
            </span>
            <span className={active ? 'font-medium' : 'text-zinc-500'}>{step.label}</span>
            {index < STEPS.length - 1 ? (
              <span className="mx-1 h-px w-8 bg-zinc-300 dark:bg-zinc-700" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
