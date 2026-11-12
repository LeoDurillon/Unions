// The Usage page's Cost tab: what to improve, then the totals over the range. Then the cost per week, and per
// step, model and ticket.
import type { ProjectUsage } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { UsageBreakdown } from './usage-breakdown';
import { Tiles } from './usage-tiles';
import { WeeksChart } from './weeks-chart';

export function UsageCost({
  usage,
  improve,
  onOpenTicket,
}: {
  usage: ProjectUsage;
  /** The banner leading to What to improve, when something stands out. */
  improve: ReactNode;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  return (
    <>
      {improve}
      <Tiles total={usage.total} models={usage.models} />
      {usage.total.calls === 0 ? (
        <p className="text-sm text-zinc-500">No agent call in this range.</p>
      ) : (
        <>
          <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-[13px] font-semibold">Cost per week</h3>
            <WeeksChart weeks={usage.weeks} />
          </section>
          <UsageBreakdown usage={usage} onOpenTicket={onOpenTicket} />
        </>
      )}
    </>
  );
}
