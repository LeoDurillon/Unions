// The panel's top tabs: the ticket, its preview, the agents' work, its pull request and the tracker
// item's comments. The comments are those of the tracker item it came from: its Notion page's, or
// its Jira issue's.

import type { ReactElement, ReactNode } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { flowStepsOf, workerTabsFor, type WorkerTab } from '../../lib/ticket/worker-tabs';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';
import { PreviewTab } from '../previews/preview-tab';
import { PullRequestTab } from '../pull-request/pull-request-tab';
import { LogTab } from '../steps/log-tab';
import { StepTab } from '../steps/step-tab';
import { TRACKER_LABELS, TrackerTab, trackerSection } from '../tracker/tracker-tab';
import { OverviewTab } from './overview-tab';

/** The panel's top tabs: the ticket, its preview, the agents' work, its pull request, its tracker item. */
export type Section = 'overview' | 'preview' | 'worker' | 'pull-request' | 'notion' | 'jira';
export { latestWorkerTab, type WorkerTab } from '../../lib/ticket/worker-tabs';
type TabEntry<T> = { id: T; label: string; enabled: boolean; badge?: ReactNode };

const COUNT =
  'rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-300';

function sectionsFor(detail: TicketDetail): TabEntry<Section>[] {
  const { prNumber } = detail.ticket;
  const tracker = trackerSection(detail.ticket);
  const ran = flowStepsOf(detail).filter((step) =>
    detail.outputs.some((output) => output.step === step),
  ).length;
  const sections: TabEntry<Section>[] = [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'preview', label: 'Preview', enabled: true },
    {
      id: 'worker',
      label: 'Steps',
      enabled: true,
      badge: ran > 0 ? <span className={COUNT}>{ran}</span> : null,
    },
    { id: 'pull-request', label: prNumber === null ? 'PR' : `PR #${prNumber}`, enabled: true },
  ];
  // A tracker tab the ticket has nothing for stays out of the way.
  return tracker.enabled
    ? [...sections, { ...tracker, label: TRACKER_LABELS[tracker.id] }]
    : sections;
}

const LOOKS = {
  top: {
    // Sticks under the panel's top bar while the page scrolls.
    bar: 'sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90',
    tab: 'flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 font-medium',
    on: 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100',
    off: 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
  },
  sub: {
    bar: 'mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900',
    tab: 'rounded-md px-2.5 py-1',
    on: 'bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700',
    off: 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100',
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
      {tabs.map(({ id, label: text, enabled, badge }) => (
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
          {badge}
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
  const names = useCustomAgentNames();
  return (
    <div>
      <TabBar
        label="Steps"
        tabs={workerTabsFor(detail, names)}
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
  onSection,
}: {
  detail: TicketDetail;
  section: Section;
  workerTab: WorkerTab;
  onWorkerTab: (tab: WorkerTab) => void;
  onOpenTicket: (id: number) => void;
  onSection: (section: Section) => void;
}): ReactElement {
  if (section === 'overview') {
    return <OverviewTab detail={detail} onOpenTicket={onOpenTicket} onOpenTab={onSection} />;
  }
  if (section === 'preview') {
    return <PreviewTab detail={detail} />;
  }
  if (section === 'pull-request') {
    return <PullRequestTab detail={detail} />;
  }
  const tracker = trackerSection(detail.ticket);
  if (section === tracker.id && tracker.enabled) {
    return <TrackerTab ticket={detail.ticket} section={tracker.id} />;
  }
  return <WorkerBody detail={detail} tab={workerTab} onTab={onWorkerTab} />;
}
