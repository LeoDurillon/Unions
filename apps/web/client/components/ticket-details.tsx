// What the ticket is attached to: where it comes from, what it depends on, its files, its preview.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { BaseBranchRow } from './base-branch-row';
import { DetailRow } from './detail-row';
import { FlowRow } from './flow-row';
import { PreviewSummary } from './preview-summary';
import { TicketAttachments } from './ticket-attachments';
import { TicketLinks } from './ticket-links';

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
      {ticket.notionPageId ? (
        <>
          {' · '}
          <a
            className="text-indigo-600 underline dark:text-indigo-400"
            href={`https://www.notion.so/${ticket.notionPageId.replaceAll('-', '')}`}
            target="_blank"
            rel="noreferrer"
          >
            Notion page
          </a>
        </>
      ) : null}
    </DetailRow>
  );
}

/** What the ticket is attached to: where it comes from, what it depends on, its files, its preview. */
export function TicketDetails({
  detail,
  onOpenTicket,
  onOpenPreview,
}: {
  detail: TicketDetail;
  onOpenTicket: (id: number) => void;
  onOpenPreview: () => void;
}): ReactElement {
  const { ticket } = detail;
  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <SourceRow detail={detail} />
      <TicketLinks detail={detail} onOpen={onOpenTicket} />
      <BaseBranchRow detail={detail} />
      <FlowRow detail={detail} />
      <TicketAttachments ticketId={ticket.id} />
      <PreviewSummary ticketId={ticket.id} onOpenTab={onOpenPreview} />
    </div>
  );
}
