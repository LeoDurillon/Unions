// The ticket panel's overview tab: the description beside the details the ticket is attached to, then its runs.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { RunTable } from './run-table';
import { TicketDescription } from './ticket-description';
import { TicketDetails } from './ticket-details';

/** Start sits in the attention card above the tabs, Cancel and Remove in the header's ⋯ menu. */
export function OverviewTab({
  detail,
  onOpenTicket,
  onOpenTab,
}: {
  detail: TicketDetail;
  onOpenTicket: (id: number) => void;
  /** The Preview and Notion tabs, from their summaries here. */
  onOpenTab: (tab: 'preview' | 'notion' | 'jira') => void;
}): ReactElement {
  const { ticket, runs } = detail;
  return (
    // Side by side once the panel is wide enough; the details go under the description when it is not.
    <div className="@container space-y-8">
      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_18rem]">
        <TicketDescription ticket={ticket} />
        <TicketDetails detail={detail} onOpenTicket={onOpenTicket} onOpenTab={onOpenTab} />
      </div>
      <RunTable ticketId={ticket.id} runs={runs} />
    </div>
  );
}
