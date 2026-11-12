// The ticket's rows for the trackers it can come from, in its Overview: its Notion page (or Link a page), its Jira issue.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { TicketJiraRow } from './ticket-jira-row';
import { TicketNotionRow } from './ticket-notion-row';

export function TicketTrackerRows({
  detail,
  onOpenTab,
}: {
  detail: TicketDetail;
  /** Opens the tracker's tab: the comments the row counts. */
  onOpenTab: (tab: 'notion' | 'jira') => void;
}): ReactElement {
  return (
    <>
      <TicketNotionRow
        detail={detail}
        onOpenComments={() => {
          onOpenTab('notion');
        }}
      />
      <TicketJiraRow
        detail={detail}
        onOpenComments={() => {
          onOpenTab('jira');
        }}
      />
    </>
  );
}
