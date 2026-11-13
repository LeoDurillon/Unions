// The panel's tracker tab: the card of the tracker item the ticket came from, then its comments.

import {
  INTEGRATION_KIND_NAMES,
  integrationKind,
  type IntegrationKindName,
} from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { useTrackerComments } from '../../lib/integrations/use-tracker-comments';
import { useTrackerItem } from '../../lib/integrations/use-tracker-item';
import { TicketItemCard } from './ticket-item-card';
import { TrackerComments } from './tracker-comments';

/**
 * The fifth tab: the tracker the ticket came from (a ticket has one origin), the first tracker's when it
 * has none, so the tab stays in its place, disabled.
 */
export function trackerSection(ticket: TicketSummary): {
  id: TrackerTabId;
  label: string;
  enabled: boolean;
} {
  const [first] = INTEGRATION_KIND_NAMES;
  const linked = ticket.originId === null ? null : ticket.originKind;
  const id = linked ?? first;
  return { id, label: integrationKind(id).label, enabled: linked !== null };
}

/** A tracker tab's id: its tracker's kind. */
export type TrackerTabId = IntegrationKindName;

type TabProps = { ticket: { id: number; projectId: number }; section: IntegrationKindName };

/** The item and its comments, read together; Refresh reads both again. */
function TabBody({ ticket, section }: TabProps): ReactElement {
  const item = useTrackerItem(ticket.id, section);
  const comments = useTrackerComments(ticket.id, section);
  const card = {
    ticket,
    loaded: item.data !== undefined || item.error !== null,
    reading: item.isFetching || comments.isFetching,
    onRefresh: () => {
      void item.refetch();
      void comments.refetch();
    },
  };
  const below = (
    <TrackerComments ticketId={ticket.id} kind={integrationKind(section)} comments={comments} />
  );
  return (
    <div className="space-y-4">
      <TicketItemCard {...card} kind={section} view={item.data ?? null}>
        {below}
      </TicketItemCard>
    </div>
  );
}

/** The tracker tab's body, for a ticket `trackerSection` enables it on; a new ticket starts afresh. */
export function TrackerTab({ ticket, section }: TabProps): ReactElement {
  return <TabBody key={ticket.id} ticket={ticket} section={section} />;
}
