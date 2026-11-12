// An investigation's tabs: the conversation, the agent's live log, and what its agent calls used.
// The conversation has the follow-up box once answered.

import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import { formatWhen } from '../../lib/ui/relative-time';
import { useInvestigationUsage } from '../../lib/usage/use-usage';
import { AgentLog } from '../steps/log-tab';
import { TabButton } from '../ui/tab-button';
import { UsageTable } from '../usage/usage-table';
import { isActive } from './investigation-labels';
import { Conversation, FollowUpForm } from './investigation-thread';

type Tab = 'conversation' | 'log' | 'usage';

/** One row per agent call: the first answer, then each follow-up. */
function InvestigationUsage({ investigation }: { investigation: Investigation }): ReactElement {
  const usage = useInvestigationUsage(investigation);
  const groups = usage.data?.groups ?? [];
  if (usage.data && groups.length === 0) {
    return <p className="text-sm text-zinc-500">No agent call has ended yet.</p>;
  }
  const rows = groups.map((group, index) => ({
    key: group.key,
    cells: [`#${index + 1}`, formatWhen(group.calls[0]?.at ?? 0)],
    group,
  }));
  return <UsageTable columns={['Call', 'Ended']} rows={rows} total={usage.data?.total} />;
}

export function InvestigationTabs({
  investigation,
}: {
  investigation: Investigation;
}): ReactElement {
  // Remounted on every status change (see the key in the page): running shows the log, done the answer.
  const [tab, setTab] = useState<Tab>(isActive(investigation.status) ? 'log' : 'conversation');
  return (
    <>
      <div
        role="tablist"
        aria-label="Investigation"
        className="sticky top-0 z-10 flex border-b border-zinc-200 bg-white/90 px-8 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90"
      >
        <TabButton tab="conversation" current={tab} label="Conversation" onSelect={setTab} />
        <TabButton tab="log" current={tab} label="Log" onSelect={setTab} />
        <TabButton tab="usage" current={tab} label="Usage" onSelect={setTab} />
      </div>
      <div className="mx-auto max-w-4xl space-y-6 px-8 py-6">
        {tab === 'conversation' ? (
          <>
            <Conversation
              investigation={investigation}
              onLog={() => {
                setTab('log');
              }}
            />
            {investigation.status === 'succeeded' ? (
              <FollowUpForm investigation={investigation} />
            ) : null}
          </>
        ) : null}
        {tab === 'log' ? <AgentLog source={{ investigation: investigation.id }} /> : null}
        {tab === 'usage' ? <InvestigationUsage investigation={investigation} /> : null}
      </div>
    </>
  );
}
