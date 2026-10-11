import { STEPS, type Step } from '@union/core/states';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { currentStep, STEP_TITLES } from '../lib/labels';
import { LogTab } from './log-tab';
import { OverviewTab } from './overview-tab';
import { StepTab } from './step-tab';

export type TabId = 'overview' | 'log' | Step;

function tabsFor(detail: TicketDetail): { id: TabId; label: string; enabled: boolean }[] {
  const active = currentStep(detail.ticket.phase);
  const steps = STEPS.map((step) => ({
    id: step,
    label: STEP_TITLES[step],
    enabled: step === active || detail.outputs.some((output) => output.step === step),
  }));
  return [
    { id: 'overview', label: 'Overview', enabled: true },
    ...steps,
    { id: 'log', label: 'Log', enabled: true },
  ];
}

export function Tabs({
  detail,
  tab,
  onChange,
}: {
  detail: TicketDetail;
  tab: TabId;
  onChange: (tab: TabId) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 dark:border-zinc-800"
    >
      {tabsFor(detail).map(({ id, label, enabled }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          disabled={!enabled}
          onClick={() => {
            onChange(id);
          }}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${tab === id ? 'border-indigo-600 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PanelBody({ detail, tab }: { detail: TicketDetail; tab: TabId }): ReactElement {
  if (tab === 'overview') {
    return <OverviewTab detail={detail} />;
  }
  if (tab === 'log') {
    return <LogTab key={detail.ticket.id} ticketId={detail.ticket.id} />;
  }
  return <StepTab key={tab} detail={detail} step={tab} />;
}
