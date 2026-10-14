import { STEPS, type Step } from '@union/core/states';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { currentStep, STEP_TITLES } from '../lib/labels';
import { LogTab } from './log-tab';
import { OverviewTab } from './overview-tab';
import { PreviewTab } from './preview-tab';
import { PullRequestTab } from './pull-request-tab';
import { StepTab } from './step-tab';

/** The panel's top tabs: the ticket, its preview, the agents' work, and its pull request. */
export type Section = 'overview' | 'preview' | 'worker' | 'pull-request';
/** The Worker tab's own tabs: one per step, then the log. */
export type WorkerTab = 'log' | Step;

/** Where the Worker tab opens when no step runs: the furthest step with output, else the log. */
export function latestWorkerTab(detail: TicketDetail): WorkerTab {
  const done = STEPS.filter((step) => detail.outputs.some((output) => output.step === step));
  return done.at(-1) ?? 'log';
}

type TabEntry<T> = { id: T; label: string; enabled: boolean };

function sectionsFor(detail: TicketDetail): TabEntry<Section>[] {
  const { prNumber } = detail.ticket;
  return [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'preview', label: 'Preview', enabled: true },
    { id: 'worker', label: 'Worker', enabled: true },
    { id: 'pull-request', label: prNumber === null ? 'PR' : `PR #${prNumber}`, enabled: true },
  ];
}

function workerTabsFor(detail: TicketDetail): TabEntry<WorkerTab>[] {
  const active = currentStep(detail.ticket.phase);
  const steps = STEPS.map((step) => ({
    id: step,
    label: STEP_TITLES[step],
    enabled: step === active || detail.outputs.some((output) => output.step === step),
  }));
  // Rebase is not a pipeline step: its tab appears once one ran or runs.
  const rebased = active === 'rebase' || detail.outputs.some((output) => output.step === 'rebase');
  const rebase = rebased
    ? [{ id: 'rebase' as const, label: STEP_TITLES.rebase, enabled: true }]
    : [];
  return [...steps, ...rebase, { id: 'log', label: 'Log', enabled: true }];
}

const LOOKS = {
  top: {
    bar: 'flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 dark:border-zinc-800',
    tab: 'border-b-2 px-3 py-2',
    on: 'border-indigo-600 font-medium',
    off: 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
  },
  sub: {
    bar: 'flex gap-1 overflow-x-auto pb-3',
    tab: 'rounded-md px-2.5 py-1',
    on: 'bg-indigo-100 font-medium dark:bg-indigo-950',
    off: 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
  },
} as const;

function TabBar<T extends string>({
  label,
  tabs,
  current,
  look,
  onChange,
}: {
  label: string;
  tabs: TabEntry<T>[];
  current: T;
  look: keyof typeof LOOKS;
  onChange: (tab: T) => void;
}): ReactElement {
  const style = LOOKS[look];
  return (
    <div role="tablist" aria-label={label} className={style.bar}>
      {tabs.map(({ id, label: text, enabled }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={current === id}
          disabled={!enabled}
          onClick={() => {
            onChange(id);
          }}
          className={`whitespace-nowrap text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${style.tab} ${current === id ? style.on : style.off}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function SectionTabs({
  detail,
  section,
  onChange,
}: {
  detail: TicketDetail;
  section: Section;
  onChange: (section: Section) => void;
}): ReactElement {
  return (
    <TabBar
      label="Ticket"
      tabs={sectionsFor(detail)}
      current={section}
      look="top"
      onChange={onChange}
    />
  );
}

function WorkerBody({
  detail,
  tab,
  onTab,
}: {
  detail: TicketDetail;
  tab: WorkerTab;
  onTab: (tab: WorkerTab) => void;
}): ReactElement {
  return (
    <div>
      <TabBar
        label="Steps"
        tabs={workerTabsFor(detail)}
        current={tab}
        look="sub"
        onChange={onTab}
      />
      {tab === 'log' ? (
        <LogTab key={detail.ticket.id} ticketId={detail.ticket.id} />
      ) : (
        <StepTab key={tab} detail={detail} step={tab} />
      )}
    </div>
  );
}

export function PanelBody({
  detail,
  section,
  workerTab,
  onWorkerTab,
  onOpenTicket,
  onRemoved,
  onSection,
}: {
  detail: TicketDetail;
  section: Section;
  workerTab: WorkerTab;
  onWorkerTab: (tab: WorkerTab) => void;
  onOpenTicket: (id: number) => void;
  onRemoved: () => void;
  onSection: (section: Section) => void;
}): ReactElement {
  if (section === 'overview') {
    return (
      <OverviewTab
        detail={detail}
        onOpenTicket={onOpenTicket}
        onRemoved={onRemoved}
        onOpenPreview={() => {
          onSection('preview');
        }}
      />
    );
  }
  if (section === 'preview') {
    return <PreviewTab detail={detail} />;
  }
  if (section === 'pull-request') {
    return <PullRequestTab detail={detail} />;
  }
  return <WorkerBody detail={detail} tab={workerTab} onTab={onWorkerTab} />;
}
