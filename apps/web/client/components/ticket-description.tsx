// The ticket's description, folded when long, and its title and description edited in place.
import { useQuery } from '@tanstack/react-query';
import { notionMarkdown } from '@union/core/notion-markdown';
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { attachmentsApi, attachmentUrl } from '../lib/attachments-api';
import type { TicketText } from '../lib/use-ticket-edit';
import { FoldedMarkdown } from './folded-markdown';
import { TicketTextEditor } from './ticket-text-editor';
import { Button } from './ui';

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
 * The ticket's description, folded when long, and its title and description edited in place. A
 * Notion import is cleaned as it is shown too: tickets imported before the import cleaned them
 * still read well.
 */
export function TicketDescription({ ticket }: { ticket: TicketDetail['ticket'] }): ReactElement {
  const files = useFileUrls(ticket.id);
  const [editing, setEditing] = useState<TicketText | null>(null);
  if (editing) {
    return (
      <TicketTextEditor
        ticket={ticket}
        base={editing}
        onDone={() => {
          setEditing(null);
        }}
      />
    );
  }
  const body = ticket.originKind === 'notion' ? notionMarkdown(ticket.body) : ticket.body;
  return (
    <section className="space-y-2" aria-label="Description">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Description</h3>
        <Button
          className="px-2 py-1 text-xs"
          onClick={() => {
            setEditing({ title: ticket.title, body: ticket.body });
          }}
        >
          Edit
        </Button>
      </div>
      {body.trim() === '' ? (
        <p className="text-sm text-zinc-500">No description.</p>
      ) : (
        <FoldedMarkdown files={files}>{body}</FoldedMarkdown>
      )}
    </section>
  );
}
