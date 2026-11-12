// What the ticket is attached to: where it comes from, what it depends on, its size, its files, its preview.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { BaseBranchRow } from './base-branch-row';
import { DetailRow } from './detail-row';
import { FlowRow } from './flow-row';
import { PreviewSummary } from './preview-summary';
import { SizeRow } from './size-row';
import { TicketAttachments } from './ticket-attachments';
import { TicketLinks } from './ticket-links';
import { TicketTrackerRows } from './ticket-tracker-rows';

function SourceRow({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  const issueUrl =
    ticket.issueNumber === null
      ? null
      : `https://github.com/${project.owner}/${project.repo}/issues/${ticket.issueNumber}`;
  return (
    <DetailRow label="Source">
      {project.owner}/{project.repo} ·{' '}
      {issueUrl ? (
        <a
          className="text-indigo-600 underline dark:text-indigo-400"
          href={issueUrl}
          target="_blank"
          rel="noreferrer"
        >
          issue #{ticket.issueNumber}
        </a>
      ) : (
        'GitHub issue not created yet'
      )}
    </DetailRow>
  );
}

/** What the ticket is attached to: where it comes from, what it depends on, its files, its preview. */
export function TicketDetails({
  detail,
  onOpenTicket,
  onOpenTab,
}: {
  detail: TicketDetail;
  onOpenTicket: (id: number) => void;
  onOpenTab: (tab: 'preview' | 'notion' | 'jira') => void;
}): ReactElement {
  const { ticket } = detail;
  return (
    <aside
      aria-label="Details"
      className="h-fit divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-4 py-3 dark:divide-zinc-800 dark:border-zinc-800"
    >
      <SourceRow detail={detail} />
      <TicketTrackerRows detail={detail} onOpenTab={onOpenTab} />
      <TicketLinks detail={detail} onOpen={onOpenTicket} />
      <BaseBranchRow detail={detail} />
      <FlowRow detail={detail} />
      <SizeRow size={detail.size} />
      <TicketAttachments ticketId={ticket.id} />
      <PreviewSummary
        ticketId={ticket.id}
        onOpenTab={() => {
          onOpenTab('preview');
        }}
      />
    </aside>
  );
}
