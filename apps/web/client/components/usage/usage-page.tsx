// A project's Usage tab: what its agents used over a range of days, with its API-equivalent cost:
// in all, per week, per step, per model and per ticket.
import type { UsageSlice } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { count } from '../../lib/token-counts';
import { costText } from '../../lib/usage-format';
import { useProjectUsage, type UsageRange } from '../../lib/use-usage';
import { Segmented, type SegmentOption } from '../choice';
import { ErrorText } from '../ui';
import { UsageBreakdown } from './usage-breakdown';
import { WeeksChart } from './weeks-chart';

const RANGES: SegmentOption<UsageRange>[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
];

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {note ? <div className="text-xs text-zinc-500">{note}</div> : null}
    </div>
  );
}

function Tiles({ total }: { total: UsageSlice }): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="API-equivalent cost" value={costText(total.costUsd)} note="Not billed on Max" />
      <Tile label="Agent calls" value={String(total.calls)} />
      <Tile label="Tokens in" value={count(total.input)} note="Cache reads included" />
      <Tile label="Tokens out" value={count(total.output)} />
    </div>
  );
}

export function UsagePage({
  project,
  onOpenTicket,
}: {
  project: PublicProject;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const [range, setRange] = useState<UsageRange>('30');
  const usage = useProjectUsage(project.id, range);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Usage</h2>
            <p className="text-xs text-zinc-500">
              What this project&apos;s agents used: its tickets and investigations. The cost is what
              these tokens would cost on the API; a Max subscription is not billed per call.
            </p>
          </div>
          <Segmented legend="Range" options={RANGES} value={range} onChange={setRange} />
        </header>
        <ErrorText error={usage.error} />
        {usage.data ? (
          <>
            <Tiles total={usage.data.total} />
            {usage.data.total.calls === 0 ? (
              <p className="text-sm text-zinc-500">No agent call in this range.</p>
            ) : (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Cost per week</h3>
                  <WeeksChart weeks={usage.data.weeks} />
                </section>
                <UsageBreakdown usage={usage.data} onOpenTicket={onOpenTicket} />
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
