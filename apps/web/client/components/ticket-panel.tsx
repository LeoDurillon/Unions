import { useQuery } from '@tanstack/react-query';
import type { Step } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import { api } from '../lib/api';
import { currentStep } from '../lib/labels';
import { ReviewPage } from './review/review-page';
import { TicketPanelHeader } from './ticket-panel-header';
import { PanelBody, Tabs, type TabId } from './ticket-tabs';
import { ErrorText } from './ui';

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
  const [tab, setTab] = useState<TabId>('overview');
  const [reviewing, setReviewing] = useState(false);
  const active = query.data ? currentStep(query.data.ticket.phase) : null;
  const [followed, setFollowed] = useState<Step | null>(null);

  // Follow the ticket to its current step when it moves, without an effect.
  if (followed !== active) {
    setFollowed(active);
    setTab(active ?? 'overview');
  }

  const detail = query.data;

  if (reviewing && detail) {
    return (
      <ReviewPage
        ticketId={detail.ticket.id}
        title={detail.ticket.title}
        onClose={() => {
          setReviewing(false);
        }}
      />
    );
  }

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
        <TicketPanelHeader
          detail={detail}
          onReview={() => {
            setReviewing(true);
          }}
          onClose={onClose}
        />
        {detail ? <Tabs detail={detail} tab={tab} onChange={setTab} /> : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ErrorText error={query.error} />
          {detail ? <PanelBody detail={detail} tab={tab} onOpenTicket={onOpenTicket} /> : null}
        </div>
      </aside>
    </div>
  );
}
