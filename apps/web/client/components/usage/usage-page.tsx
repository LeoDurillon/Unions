// A project's Usage tab: what its agents used over a range of days, and what their logs show to
// improve. The Cost tab shows the use with its API-equivalent cost; the What to improve tab shows
// the findings.

import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useProjectFindings, useProjectUsage, type UsageRange } from '../../lib/usage/use-usage';
import { Segmented, type SegmentOption } from '../ui/choice';
import { TabButton } from '../ui/tab-button';
import { ErrorText } from '../ui/ui';
import { ImproveBanner } from './improve-banner';
import { SuggestImprovements } from './suggest-improvements';
import { UsageCost } from './usage-cost';
import { UsageFindings } from './usage-findings';

const RANGES: SegmentOption<UsageRange>[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
];

type Tab = 'cost' | 'improve';

function Header({
  range,
  onRange,
}: {
  range: UsageRange;
  onRange: (range: UsageRange) => void;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Usage</h2>
        <p className="text-xs text-zinc-500">
          What this project&apos;s agents used: its tickets and investigations. The cost is what
          these tokens would cost on the API; a Max subscription is not billed per call.
        </p>
      </div>
      <Segmented legend="Range" options={RANGES} value={range} onChange={onRange} />
    </header>
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
  const [tab, setTab] = useState<Tab>('cost');
  const usage = useProjectUsage(project.id, range);
  const findings = useProjectFindings(project.id, range);
  const found = findings.data?.findings.length ?? 0;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <Header range={range} onRange={setRange} />
        <div role="tablist" className="flex border-b border-zinc-200 dark:border-zinc-800">
          <TabButton tab="cost" current={tab} label="Cost" onSelect={setTab} />
          <TabButton
            tab="improve"
            current={tab}
            label={found === 0 ? 'What to improve' : `What to improve (${found})`}
            onSelect={setTab}
          />
        </div>
        <div role="tabpanel" className="space-y-6">
          <ErrorText error={tab === 'cost' ? usage.error : findings.error} />
          {tab === 'cost' && usage.data ? (
            <UsageCost
              usage={usage.data}
              improve={
                <ImproveBanner
                  findings={findings.data}
                  onOpen={() => {
                    setTab('improve');
                  }}
                />
              }
              onOpenTicket={onOpenTicket}
            />
          ) : null}
          {tab === 'improve' && findings.data ? (
            <UsageFindings
              findings={findings.data}
              action={<SuggestImprovements projectId={project.id} range={range} />}
              onOpenTicket={onOpenTicket}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
