// The Usage tabs while their numbers are read. The tiles' labels with their values waiting, the chart's
// bars, the tables' rows, and the findings.

import type { ReactElement } from 'react';

import { Bone, Loading, SkeletonLines, SkeletonRows } from '../ui/skeleton';

const TILE_LABELS = ['API-equivalent cost', 'Agent calls', 'Tokens in', 'Tokens out'] as const;
const BAR_HEIGHTS = ['40%', '65%', '75%', '90%', '30%'] as const;
const TABLES = ['By step', 'By model'] as const;
const TABLE_ROWS = 5;
const FINDINGS = 4;
const SECTION_CLASS =
  'space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900';

/** The Cost tab: the numbers wait, the words are already there. */
export function UsageCostLoading(): ReactElement {
  return (
    <Loading label="Reading the usage" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILE_LABELS.map((label) => (
          <div
            key={label}
            className="space-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-xs text-zinc-500">{label}</div>
            <Bone className="h-6" width="50%" />
          </div>
        ))}
      </div>
      <section className={SECTION_CLASS}>
        <h3 className="text-[13px] font-semibold">Cost per week</h3>
        <div className="flex h-44 items-end gap-14 border-b border-zinc-200 px-10 dark:border-zinc-800">
          {BAR_HEIGHTS.map((height) => (
            <span key={height} className="flex-1" style={{ height }}>
              <Bone className="h-full rounded-b-none" />
            </span>
          ))}
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {TABLES.map((title) => (
          <section key={title} className={SECTION_CLASS}>
            <h3 className="text-[13px] font-semibold">{title}</h3>
            <SkeletonRows
              count={TABLE_ROWS}
              columns="grid-cols-[1.4fr_0.8fr_0.4fr_0.5fr]"
              cells={3}
              rowClassName="py-0.5"
            />
          </section>
        ))}
      </div>
    </Loading>
  );
}

/** The What to improve tab: a card per finding. */
export function UsageFindingsLoading(): ReactElement {
  return (
    <Loading label="Reading what to improve" className="grid gap-3 lg:grid-cols-2">
      {Array.from({ length: FINDINGS }, (_, index) => (
        <section key={index} className={SECTION_CLASS}>
          <SkeletonLines count={2} title />
        </section>
      ))}
    </Loading>
  );
}
