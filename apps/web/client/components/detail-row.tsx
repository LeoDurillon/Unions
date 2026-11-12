// One entry of a ticket's details, in the Overview's side column: a small label above its value.
import type { ReactElement, ReactNode } from 'react';

/** One entry of a ticket's details: a small label above its value. */
export function DetailRow({
  label,
  hint,
  children,
}: {
  label: string;
  /** Shown on hovering the label (ⓘ). */
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
      <span
        className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
        title={hint}
      >
        {label}
        {hint ? (
          <span aria-hidden="true" className="cursor-help text-xs">
            ⓘ
          </span>
        ) : null}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
