// The ticket's Jira issue in its Overview: the key, linking to the issue, and once read, its comments' count.
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import type { JiraTabView } from '../../src/jira-comment-types';
import { DetailRow } from './detail-row';

/** "· 3 comments", a link to the Jira tab; nothing until the tab has read them (Jira is not called from here). */
function CommentCount({
  ticketId,
  onOpen,
}: {
  ticketId: number;
  onOpen: () => void;
}): ReactElement | null {
  const { data } = useQuery<JiraTabView>({
    queryKey: ['jira-comments', ticketId],
    enabled: false,
    staleTime: Infinity,
  });
  if (!data) {
    return null;
  }
  return (
    <button type="button" onClick={onOpen} className="text-sm text-zinc-500 hover:underline">
      · {data.total} {data.total === 1 ? 'comment' : 'comments'}
    </button>
  );
}

/** Only for a ticket imported from (or created as) a Jira issue. */
export function TicketJiraRow({
  detail,
  onOpenComments,
}: {
  detail: TicketDetail;
  onOpenComments: () => void;
}): ReactElement | null {
  const { ticket } = detail;
  if (ticket.originKind !== 'jira' || !ticket.originId) {
    return null;
  }
  return (
    <DetailRow label="Jira">
      <span className="flex flex-wrap items-baseline gap-2">
        {ticket.originUrl ? (
          <a
            href={ticket.originUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {ticket.originId}
          </a>
        ) : (
          <span className="font-medium">{ticket.originId}</span>
        )}
        <CommentCount ticketId={ticket.id} onOpen={onOpenComments} />
      </span>
    </DetailRow>
  );
}
