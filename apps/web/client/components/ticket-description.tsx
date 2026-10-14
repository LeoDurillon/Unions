import { useQuery } from '@tanstack/react-query';
import { notionMarkdown } from '@union/core/notion-markdown';
import { useCallback, useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { attachmentsApi, attachmentUrl } from '../lib/attachments-api';
import { Markdown } from './markdown';

/** How tall a description shows before "Show more". */
const FOLDED_PX = 320;

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
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  // The text's own height, followed as images load: folded only when it is taller than the fold.
  const measure = useCallback((node: HTMLDivElement | null): (() => void) | undefined => {
    if (!node) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setLong(node.offsetHeight > FOLDED_PX);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <section className="space-y-2" aria-label="Description">
      <h3 className="text-sm font-medium">Description</h3>
      {body.trim() === '' ? (
        <p className="text-sm text-zinc-500">No description.</p>
      ) : (
        <div className={`relative ${long && !open ? 'max-h-80 overflow-hidden' : ''}`}>
          <div ref={measure}>
            <Markdown files={files}>{body}</Markdown>
          </div>
          {long && !open ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white dark:from-zinc-950" />
          ) : null}
        </div>
      )}
      {long ? (
        <button
          type="button"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </section>
  );
}
