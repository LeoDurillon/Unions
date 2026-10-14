import type { ReactElement, ReactNode } from 'react';

/** One line of a ticket's details: a label column, then the value. */
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
    <div className="flex items-start gap-2 text-sm">
      <span className="flex w-24 shrink-0 items-center gap-1 pt-0.5 text-zinc-500" title={hint}>
        {label}
        {hint ? (
          <span aria-hidden="true" className="cursor-help text-xs">
            ⓘ
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
