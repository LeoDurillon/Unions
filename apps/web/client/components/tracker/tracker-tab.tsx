// The panel's tracker tab: the comments of the Notion page or Jira issue the ticket came from, and which one it has.

import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { JiraTab } from '../jira/jira-tab';
import { NotionTab } from '../notion/notion-tab';

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

/** The tracker tab's body, for a ticket `trackerSection` enables it on. */
export function TrackerTab({
  ticket,
  section,
}: {
  ticket: { id: number; projectId: number };
  section: 'notion' | 'jira';
}): ReactElement {
  return section === 'jira' ? (
    <JiraTab key={ticket.id} ticket={ticket} />
  ) : (
    <NotionTab key={ticket.id} ticket={ticket} />
  );
}
