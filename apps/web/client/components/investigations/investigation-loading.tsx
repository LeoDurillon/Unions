// The Investigations page while its list is read: the list's rows and the open investigation take shape.

import type { ReactElement } from 'react';

import { Bone, Loading, SkeletonLines } from '../ui/skeleton';

const ROW_WIDTHS = ['72%', '55%', '80%', '48%', '66%', '58%', '75%', '50%'] as const;

/** The list's rows: a state dot, a title, when it ran. */
export function InvestigationListLoading(): ReactElement {
  return (
    <Loading label="Reading the investigations" className="space-y-3 px-2.5 pt-3">
      <Bone className="h-2.5 w-18" />
      {ROW_WIDTHS.map((width) => (
        <div key={width} className="flex items-start gap-2.5">
          <Bone className="mt-1 size-2 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bone width={width} />
            <Bone className="h-2.5" width="30%" />
          </div>
          <Bone className="h-2.5 w-9" />
        </div>
      ))}
    </Loading>
  );
}

/** The open investigation: its title, its state and scope, the question asked and the answer. */
export function InvestigationDetailLoading(): ReactElement {
  return (
    <div className="px-10 py-7">
      <Loading label="Reading the investigation" className="space-y-4.5">
        <Bone className="h-5.5" width="40%" />
        <div className="flex items-center gap-2">
          <Bone className="h-5 w-20 rounded-full" />
          <Bone className="h-3 w-64" />
        </div>
        <Bone className="ml-auto h-17 rounded-2xl" width="55%" />
        <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-white px-5 py-4.5 dark:border-zinc-800 dark:bg-zinc-900">
          <SkeletonLines title />
        </div>
      </Loading>
    </div>
  );
}
