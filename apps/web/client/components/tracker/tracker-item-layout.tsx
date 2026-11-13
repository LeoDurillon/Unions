// A tracker item's tab laid out as the ticket's Overview: its content, and its properties in a side column.

import type { ReactElement, ReactNode } from 'react';

/** Side by side once the panel is wide enough; the side column goes under the content when it is not. */
export function TrackerItemLayout({
  side,
  children,
}: {
  /** The side column; null: the content takes the whole width. */
  side: ReactNode;
  children: ReactNode;
}): ReactElement {
  if (side === null) {
    return <div className="min-w-0 space-y-4">{children}</div>;
  }
  return (
    <div className="@container">
      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">{children}</div>
        {side}
      </div>
    </div>
  );
}
