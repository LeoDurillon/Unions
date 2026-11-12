// A ticket's review page: its diff beside tabs for its description, preview, pull request, spec
// report and review agents. The tabs sit beside the diff as a pull request review has them; it
// opens on the diff. The tab is kept in the URL.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useReviewTab } from '../../lib/review/review-url';
import { ReviewPage, type ReviewSection } from '../layout/lazy-pages';
import { PreviewTab } from '../previews/preview-tab';
import { PullRequestTab } from '../pull-request/pull-request-tab';
import { ReportTab } from '../review/report-tab';
import { ReviewAgentsTab } from '../review/review-agents-tab';
import { ReviewTicketTab } from './review-ticket-tab';

function sectionsOf(detail: TicketDetail): ReviewSection[] {
  const { prNumber } = detail.ticket;
  return [
    { id: 'ticket', label: 'Ticket', content: <ReviewTicketTab ticket={detail.ticket} /> },
    { id: 'preview', label: 'Preview', content: <PreviewTab detail={detail} /> },
    {
      id: 'pull-request',
      label: prNumber === null ? 'PR' : `PR #${prNumber}`,
      content: <PullRequestTab detail={detail} />,
    },
    {
      id: 'report',
      label: 'Report',
      content: ({ openDiff }) => (
        <ReportTab target={{ kind: 'ticket', ticketId: detail.ticket.id }} openDiff={openDiff} />
      ),
    },
    {
      id: 'agents',
      label: 'Agents',
      content: ({ openDiff }) => (
        <ReviewAgentsTab
          target={{ kind: 'ticket', ticketId: detail.ticket.id }}
          openDiff={openDiff}
        />
      ),
    },
  ];
}

/** A ticket's review page: the diff, with the ticket's description, preview and pull request as tabs. */
export function TicketReview({
  detail,
  onClose,
}: {
  detail: TicketDetail;
  onClose: () => void;
}): ReactElement {
  const { ticket } = detail;
  const tab = useReviewTab();
  return (
    <ReviewPage
      target={{ kind: 'ticket', ticketId: ticket.id }}
      title={ticket.title}
      sections={sectionsOf(detail)}
      startOn="diff"
      tab={tab}
      onClose={onClose}
    />
  );
}
