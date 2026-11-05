// The Usage page's Cost tab: the totals over the range, the cost per week, and per step, model and ticket.
import type { ProjectUsage } from '@union/core';
import type { ReactElement } from 'react';

import { UsageBreakdown } from './usage-breakdown';
import { Tiles } from './usage-tiles';
import { WeeksChart } from './weeks-chart';

export function UsageCost({
  usage,
  onOpenTicket,
}: {
  usage: ProjectUsage;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  return (
    <>
      <Tiles total={usage.total} />
      {usage.total.calls === 0 ? (
        <p className="text-sm text-zinc-500">No agent call in this range.</p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Cost per week</h3>
            <WeeksChart weeks={usage.weeks} />
          </section>
          <UsageBreakdown usage={usage} onOpenTicket={onOpenTicket} />
        </>
      )}
    </>
  );
}
