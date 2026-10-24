// The side panel for the selected ticket: header, section tabs and the body of the current tab.
import { useQuery } from '@tanstack/react-query';
import type { Step } from '@union/core/states';
import { useState, type ReactElement, type ReactNode } from 'react';

import { api } from '../lib/api';
import { currentStep } from '../lib/labels';
import { ReviewNotionContext } from '../lib/review-notion-context';
import { ReviewPage } from './review/review-page';
import { TicketPanelHeader } from './ticket-panel-header';
import {
  latestWorkerTab,
  PanelBody,
  SectionTabs,
  type Section,
  type WorkerTab,
} from './ticket-tabs';
import { ErrorText } from './ui';

/**
 * The open tabs; they follow the ticket to the Worker tab of its current step when it moves.
 * `active` is undefined until the ticket has loaded.
 */
function usePanelTabs(
  active: Step | null | undefined,
  latest: WorkerTab,
): {
  section: Section;
  setSection: (section: Section) => void;
  workerTab: WorkerTab;
  setWorkerTab: (tab: WorkerTab) => void;
} {
  const [section, setSection] = useState<Section>('overview');
  const [workerTab, setWorkerTab] = useState<WorkerTab>('log');
  const [followed, setFollowed] = useState<Step | null | undefined>();
  // Without an effect: state set during render is applied before anything is shown.
  if (active !== undefined && followed !== active) {
    setFollowed(active);
    setSection(active ? 'worker' : 'overview');
    setWorkerTab(active ?? latest);
  }
  return { section, setSection, workerTab, setWorkerTab };
}

/** The slide-over: a click on the backdrop closes it. */
function PanelShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className="fixed inset-0 z-10 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl dark:bg-zinc-950"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="presentation"
      >
        {children}
      </aside>
    </div>
  );
}

export function TicketPanel({
  ticketId,
  onClose,
  onOpenTicket,
}: {
  ticketId: number;
  onClose: () => void;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const query = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => api.ticket(ticketId) });
  const { section, setSection, workerTab, setWorkerTab } = usePanelTabs(
    query.data ? currentStep(query.data.ticket.phase) : undefined,
    query.data ? latestWorkerTab(query.data) : 'log',
  );
  const [reviewing, setReviewing] = useState(false);

  const detail = query.data;

  if (reviewing && detail) {
    return (
      <ReviewNotionContext.Provider
        value={detail.ticket.originKind === 'notion' ? detail.ticket.originId : null}
      >
        <ReviewPage
          target={{ kind: 'ticket', ticketId: detail.ticket.id }}
          title={detail.ticket.title}
          onClose={() => {
            setReviewing(false);
          }}
        />
      </ReviewNotionContext.Provider>
    );
  }

  return (
    <PanelShell onClose={onClose}>
      <TicketPanelHeader
        detail={detail}
        onReview={() => {
          setReviewing(true);
        }}
        onClose={onClose}
      />
      {detail ? <SectionTabs detail={detail} section={section} onChange={setSection} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ErrorText error={query.error} />
        {detail ? (
          <PanelBody
            detail={detail}
            section={section}
            workerTab={workerTab}
            onWorkerTab={setWorkerTab}
            onOpenTicket={onOpenTicket}
            onRemoved={onClose}
            onSection={setSection}
          />
        ) : null}
      </div>
    </PanelShell>
  );
}
