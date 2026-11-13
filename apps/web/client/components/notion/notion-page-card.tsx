// The Notion tab's page card: the page's title, its status column's value and its last edit, Open in Notion, Refresh.
// Then its properties, each one Union can set with Edit.

import type { ReactElement } from 'react';

import type { NotionPageFacts, NotionTabView } from '../../../src/notion-discussion-types';
import { notionCommentsKey } from '../../lib/integrations/use-notion-comments';
import { ticketFieldTarget, useTrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { TrackerItemCard } from '../tracker/tracker-item-card';

/** `status In review · edited 2 h ago`, or what Notion did not give left out. */
function PageFacts({ facts }: { facts: NotionPageFacts }): ReactElement {
  const now = useNow(false);
  return (
    <p className="truncate text-xs text-zinc-500">
      Notion page
      {facts.status ? (
        <>
          {' · '}
          {facts.status.name}{' '}
          <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
            {facts.status.value}
          </strong>
        </>
      ) : null}
      {facts.editedAt ? ` · edited ${timeAgo(Date.parse(facts.editedAt), now)}` : ''}
    </p>
  );
}

/** A page Notion could not read: what the tab still shows. */
function Heading({ facts }: { facts: NotionPageFacts | null }): ReactElement {
  if (facts === null) {
    return (
      <>
        <p className="text-sm font-semibold">Notion page</p>
        <p className="text-xs text-zinc-500">Its open discussions, read when the tab opens.</p>
      </>
    );
  }
  return (
    <>
      <p className="truncate text-sm font-semibold" title={facts.title}>
        {facts.title || 'Untitled page'}
      </p>
      <PageFacts facts={facts} />
    </>
  );
}

export function NotionPageCard({
  ticket,
  view,
  loaded,
  reading,
  onRefresh,
}: {
  ticket: { id: number; projectId: number };
  /** The tab's view, once read. */
  view: NotionTabView | null;
  /** Notion answered (the page read or not). */
  loaded: boolean;
  reading: boolean;
  onRefresh: () => void;
}): ReactElement {
  const sender = useTrackerFieldSend(ticketFieldTarget(ticket.id, notionCommentsKey(ticket.id)));
  const facts = view?.page ?? null;
  return (
    <TrackerItemCard
      mark="N"
      loaded={loaded}
      open={view ? { url: view.pageUrl, label: 'Open in Notion' } : null}
      reading={reading}
      onRefresh={onRefresh}
      properties={facts?.properties ?? []}
      editing={{
        kind: 'notion',
        transitionsUrl: null,
        projectId: ticket.projectId,
        pending: view?.pendingFields ?? [],
        sender,
      }}
    >
      <Heading facts={facts} />
    </TrackerItemCard>
  );
}
