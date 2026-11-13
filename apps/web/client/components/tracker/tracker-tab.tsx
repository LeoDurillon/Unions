// The panel's tracker tab: the card of the Notion page or Jira issue the ticket came from, then its comments.

import { integrationKind } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { useTrackerComments } from '../../lib/integrations/use-tracker-comments';
import { useTrackerItem } from '../../lib/integrations/use-tracker-item';
import { JiraIssueCard } from '../jira/jira-issue-card';
import { NotionPageCard } from '../notion/notion-page-card';
import { TrackerComments } from './tracker-comments';

/** Imported from a Notion page, created as one, or linked to one: its comments can be read. */
function hasNotionPage(ticket: TicketSummary): boolean {
  return ticket.originKind === 'notion' && ticket.originId !== null;
}

/** Imported from a Jira issue: its comments can be read. */
function hasJiraIssue(ticket: TicketSummary): boolean {
  return ticket.originKind === 'jira' && ticket.originId !== null;
}

/**
 * The fifth tab: the tracker the ticket came from (a ticket has one origin), Notion's when it has
 * none, so the tab stays in its place, disabled.
 */
export function trackerSection(ticket: TicketSummary): { id: 'notion' | 'jira'; enabled: boolean } {
  return hasJiraIssue(ticket)
    ? { id: 'jira', enabled: true }
    : { id: 'notion', enabled: hasNotionPage(ticket) };
}

export const TRACKER_LABELS = { notion: 'Notion', jira: 'Jira' } as const;

type TabProps = { ticket: { id: number; projectId: number }; section: 'notion' | 'jira' };

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
  const view = item.data ?? null;
  return (
    <div className="space-y-4">
      {section === 'jira' ? (
        <JiraIssueCard {...card} view={view?.kind === 'jira' ? view : null}>
          {below}
        </JiraIssueCard>
      ) : (
        <NotionPageCard {...card} view={view?.kind === 'notion' ? view : null}>
          {below}
        </NotionPageCard>
      )}
    </div>
  );
}

/** The tracker tab's body, for a ticket `trackerSection` enables it on; a new ticket starts afresh. */
export function TrackerTab({ ticket, section }: TabProps): ReactElement {
  return <TabBody key={ticket.id} ticket={ticket} section={section} />;
}
