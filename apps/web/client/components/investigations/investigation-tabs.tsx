// An investigation's tabs: its latest answer, the agent's live log, and what its agent calls used.
import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import { useInvestigationUsage } from '../../lib/use-usage';
import { AgentLog } from '../log-tab';
import { Markdown } from '../markdown';
import { UsageTable } from '../usage/usage-table';
import { isActive } from './investigation-labels';

type Tab = 'result' | 'log' | 'usage';

function TabButton({
  tab,
  current,
  label,
  onSelect,
}: {
  tab: Tab;
  current: Tab;
  label: string;
  onSelect: (tab: Tab) => void;
}): ReactElement {
  const on = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => {
        onSelect(tab);
      }}
      className={`border-b-2 px-3 py-1.5 text-sm ${on ? 'border-indigo-500 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
    >
      {label}
    </button>
  );
}

function Answer({ investigation }: { investigation: Investigation }): ReactElement {
  if (investigation.error !== null) {
    return (
      <p className="rounded-md bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-800 dark:bg-red-950/40 dark:text-red-300">
        {investigation.error}
      </p>
    );
  }
  if (investigation.result !== null) {
    return <Markdown>{investigation.result}</Markdown>;
  }
  const waiting = isActive(investigation.status) ? 'The agent is still working: see the Log.' : '';
  return <p className="text-sm text-zinc-500">No answer. {waiting}</p>;
}

/** One row per agent call: the first answer, then each follow-up. */
function InvestigationUsage({ investigation }: { investigation: Investigation }): ReactElement {
  const usage = useInvestigationUsage(investigation);
  const groups = usage.data?.groups ?? [];
  if (usage.data && groups.length === 0) {
    return <p className="text-sm text-zinc-500">No agent call has ended yet.</p>;
  }
  const rows = groups.map((group, index) => ({
    key: group.key,
    cells: [`#${index + 1}`, new Date(group.calls[0]?.at ?? 0).toLocaleString()],
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
  const [tab, setTab] = useState<Tab>(isActive(investigation.status) ? 'log' : 'result');
  return (
    <>
      <div role="tablist" className="flex border-b border-zinc-200 dark:border-zinc-800">
        <TabButton tab="result" current={tab} label="Answer" onSelect={setTab} />
        <TabButton tab="log" current={tab} label="Log" onSelect={setTab} />
        <TabButton tab="usage" current={tab} label="Usage" onSelect={setTab} />
      </div>
      {tab === 'result' ? <Answer investigation={investigation} /> : null}
      {tab === 'log' ? <AgentLog source={{ investigation: investigation.id }} /> : null}
      {tab === 'usage' ? <InvestigationUsage investigation={investigation} /> : null}
    </>
  );
}
