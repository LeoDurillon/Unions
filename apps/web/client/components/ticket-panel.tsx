// The side panel for the selected ticket: header, section tabs and the body of the current tab.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';

import { api } from '../lib/api';
import { useTicketReview } from '../lib/use-selected-ticket';
import { TicketPanelHeader } from './ticket-panel-header';
import { usePanelKeys } from './ticket-panel-keys';
import { TicketReview } from './ticket-review';
import { PanelBody, SectionTabs } from './ticket-tabs';
import { ErrorText } from './ui';
import { usePanelTabs } from './use-panel-tabs';

/**
 * The slide-over, a modal dialog (focus stays in it): a click on the backdrop or Escape
 * (`usePanelKeys`) closes it. The dialog's own Escape handling is off, so Escape in a field stays the
 * field's. `data-shortcuts` keeps the keys on while it is open.
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
  return (
    <dialog
      ref={ref}
      aria-label="Ticket"
      data-shortcuts=""
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
  const { section, setSection, workerTab, setWorkerTab } = usePanelTabs(query.data);
  const [reviewing, setReviewing] = useTicketReview();

  const detail = query.data;
  const review = (): void => {
    setReviewing(true);
  };
  const needing = usePanelKeys({
    detail,
    enabled: !reviewing,
    actions: { onClose, onOpenTicket, onReview: review, onSection: setSection },
  });

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
        onReview={review}
        onClose={onClose}
        needing={needing}
        onOpenTicket={onOpenTicket}
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
