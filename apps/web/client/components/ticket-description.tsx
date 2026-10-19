import { useQuery } from '@tanstack/react-query';
import { notionMarkdown } from '@union/core/notion-markdown';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { attachmentsApi, attachmentUrl } from '../lib/attachments-api';
import { FoldedMarkdown } from './folded-markdown';

/** The ticket's files by name, for the images its description shows (shown inline). */
function useFileUrls(ticketId: number): Record<string, string> {
  const query = useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: () => attachmentsApi.list(ticketId),
  });
  return Object.fromEntries(
    (query.data ?? []).map((file) => [file.name, `${attachmentUrl(file)}?inline`]),
  );
}

/**
 * The ticket's description, folded when long. A Notion import is cleaned as it is shown too: tickets
 * imported before the import cleaned them still read well.
 */
export function TicketDescription({ ticket }: { ticket: TicketDetail['ticket'] }): ReactElement {
  const files = useFileUrls(ticket.id);
  const body = ticket.notionPageId ? notionMarkdown(ticket.body) : ticket.body;
  return (
    <section className="space-y-2" aria-label="Description">
      <h3 className="text-sm font-medium">Description</h3>
      {body.trim() === '' ? (
        <p className="text-sm text-zinc-500">No description.</p>
      ) : (
        <FoldedMarkdown files={files}>{body}</FoldedMarkdown>
      )}
    </section>
  );
}
