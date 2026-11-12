// A project's Usage tab: what its agents used over a range of days, and what their logs show to
// improve. The Cost tab shows the use with its API-equivalent cost; the What to improve tab shows
// the findings.

import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useProjectFindings, useProjectUsage, type UsageRange } from '../../lib/usage/use-usage';
import { TabButton } from '../ui/tab-button';
import { UsageHeader } from './usage-header';
import { CostPanel, ImprovePanel } from './usage-panels';

type Tab = 'cost' | 'improve';

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
        <UsageHeader range={range} onRange={setRange} />
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
          {tab === 'cost' ? (
            <CostPanel
              usage={usage}
              findings={findings.data}
              onImprove={() => {
                setTab('improve');
              }}
              onOpenTicket={onOpenTicket}
            />
          ) : (
            <ImprovePanel
              findings={findings}
              projectId={project.id}
              range={range}
              onOpenTicket={onOpenTicket}
            />
          )}
        </div>
      </div>
    </div>
  );
}
