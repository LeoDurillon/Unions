// One row of the New ticket form: its label in a column on the left, the control beside it.

import type { ReactElement, ReactNode } from 'react';

/** Not a `<label>`: the controls (a flow picker, a ticket picker) carry their own labels. */
export function FormRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="text-sm font-medium sm:pt-1">{label}</span>
      <div>{children}</div>
    </div>
  );
}
