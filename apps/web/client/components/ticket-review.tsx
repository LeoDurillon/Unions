// A ticket's review page: the diff, with the ticket's description, preview and pull request as tabs
// beside it, as a pull request review has; it opens on the diff.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { PreviewTab } from './preview-tab';
import { PullRequestTab } from './pull-request-tab';
import { ReviewPage, type ReviewSection } from './review/review-page';
import { TicketDescription } from './ticket-description';

function sectionsOf(detail: TicketDetail): ReviewSection[] {
  const { prNumber } = detail.ticket;
  return [
    { id: 'ticket', label: 'Ticket', content: <TicketDescription ticket={detail.ticket} /> },
    { id: 'preview', label: 'Preview', content: <PreviewTab detail={detail} /> },
    {
      id: 'pull-request',
      label: prNumber === null ? 'PR' : `PR #${prNumber}`,
      content: <PullRequestTab detail={detail} />,
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
  return (
    <ReviewPage
      target={{ kind: 'ticket', ticketId: ticket.id }}
      title={ticket.title}
      sections={sectionsOf(detail)}
      startOn="diff"
      onClose={onClose}
    />
  );
}
