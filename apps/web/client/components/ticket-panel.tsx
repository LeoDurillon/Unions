// The side panel for the selected ticket: header, section tabs and the body of the current tab.
import { useQuery } from '@tanstack/react-query';
import type { Step } from '@union/core/states';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { api } from '../lib/api';
import { currentStep } from '../lib/labels';
import { useTicketReview } from '../lib/use-selected-ticket';
import { TicketPanelHeader } from './ticket-panel-header';
import { TicketReview } from './ticket-review';
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

/** Whether Escape was typed in a field, where it belongs to the field rather than the panel. */
function inField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Calls `onClose` on Escape, unless a field or an inner popover took it. */
function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented && !inField(event.target)) {
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
}

/**
 * The slide-over, a modal dialog (focus stays in it): a click on the backdrop or Escape closes it.
 * The dialog's own Escape handling is off, so Escape in a field stays the field's.
 */
function PanelShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEscape(onClose);
  return (
    <dialog
      ref={ref}
      aria-label="Ticket"
      onCancel={(event) => {
        event.preventDefault();
      }}
      className="m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-inherit backdrop:bg-transparent"
    >
      <div className="flex h-full justify-end bg-black/40" onClick={onClose} role="presentation">
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
    </dialog>
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
  const [reviewing, setReviewing] = useTicketReview();

  const detail = query.data;

  if (reviewing && detail) {
    return (
      <TicketReview
        detail={detail}
        onClose={() => {
          setReviewing(false);
        }}
      />
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
