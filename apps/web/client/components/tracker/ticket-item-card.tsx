// A ticket's tracker tab card: the item's title, key, type, status, assignee and last change, Open, Refresh.
// Then its properties, each one Union can set with Edit. One card for every tracker.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement, ReactNode } from 'react';

import type { TrackerItemView } from '../../../src/tracker-item-types';
import { ticketFieldTarget, useTrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { trackerItemKey } from '../../lib/integrations/use-tracker-item';
import { TrackerItemCard } from './tracker-item-card';
import { TrackerItemFactsLine } from './tracker-item-facts';

/** An item the tracker did not give: what the tab still shows. */
function Heading({
  kind,
  view,
}: {
  kind: IntegrationKindName;
  view: TrackerItemView | null;
}): ReactElement {
  const { label, itemLabel, namedByKey } = integrationKind(kind);
  const facts = view?.item ?? null;
  if (facts === null) {
    return (
      <>
        <p className="text-sm font-semibold">
          {namedByKey && view ? view.itemId : `${label} ${itemLabel}`}
        </p>
        <p className="text-xs text-zinc-500">Its comments, read when the tab opens.</p>
      </>
    );
  }
  return (
    <>
      <p className="truncate text-sm font-semibold" title={facts.title}>
        {facts.title || (facts.key ?? `Untitled ${itemLabel}`)}
      </p>
      <TrackerItemFactsLine kind={kind} facts={facts} />
    </>
  );
}

export function TicketItemCard({
  ticket,
  kind,
  view,
  loaded,
  reading,
  onRefresh,
  children,
}: {
  ticket: { id: number; projectId: number };
  kind: IntegrationKindName;
  /** The item, once read. */
  view: TrackerItemView | null;
  /** The tracker answered (the item read or not). */
  loaded: boolean;
  reading: boolean;
  onRefresh: () => void;
  /** The tab's content under the card. */
  children: ReactNode;
}): ReactElement {
  const sender = useTrackerFieldSend(ticketFieldTarget(ticket.id, trackerItemKey(ticket.id, kind)));
  const { label } = integrationKind(kind);
  return (
    <TrackerItemCard
      mark={label.charAt(0)}
      loaded={loaded}
      open={view ? { url: view.url, label: `Open in ${label}` } : null}
      reading={reading}
      onRefresh={onRefresh}
      below={children}
      properties={view?.item?.properties ?? []}
      editing={{
        kind,
        transitionsUrl: `/api/tickets/${ticket.id}/trackers/${kind}/moves`,
        projectId: ticket.projectId,
        pending: view?.pendingFields ?? [],
        sender,
      }}
    >
      <Heading kind={kind} view={view} />
    </TrackerItemCard>
  );
}
