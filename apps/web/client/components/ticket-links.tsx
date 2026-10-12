import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { TicketDetail, TicketRef } from '../../src/api-types';
import { api } from '../lib/api';
import { refLabel } from '../lib/labels';
import { ParentPicker } from './parent-picker';
import { Badge, ErrorText } from './ui';

function RefLink({
  target: ticket,
  onOpen,
}: {
  target: TicketRef;
  onOpen: (id: number) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="text-left text-indigo-600 underline dark:text-indigo-400"
      onClick={() => {
        onOpen(ticket.id);
      }}
    >
      {refLabel(ticket)} {ticket.title}
    </button>
  );
}

function ParentLine({
  detail,
  onOpen,
}: {
  detail: TicketDetail;
  onOpen: (id: number) => void;
}): ReactElement {
  const { ticket } = detail;
  const { parent } = ticket;
  if (!parent) {
    return <span className="text-zinc-500">Nothing: started from the base branch</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <RefLink target={parent} onOpen={onOpen} />
      {parent.done ? (
        <Badge tone="green">done</Badge>
      ) : (
        <Badge tone="amber">not done: this ticket waits</Badge>
      )}
      {ticket.baseBranch ? (
        <span className="text-xs text-zinc-500">
          branched from <code>{ticket.baseBranch}</code>
        </span>
      ) : null}
    </span>
  );
}

/** "Depends on" (editable until the ticket starts) and the tickets that build on this one. */
export function TicketLinks({
  detail,
  onOpen,
}: {
  detail: TicketDetail;
  onOpen: (id: number) => void;
}): ReactElement {
  const { ticket, children } = detail;
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (parentId: number | null) => api.setParent(ticket.id, parentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket'] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });
  const editable = ticket.phase.kind === 'backlog';
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start gap-2">
        <span className="w-24 shrink-0 text-zinc-500">Depends on</span>
        {editable ? (
          <div className="min-w-0 flex-1 space-y-1">
            <ParentPicker
              projectId={ticket.projectId}
              ticketId={ticket.id}
              value={ticket.parentTicketId}
              disabled={change.isPending}
              onChange={(parentId) => {
                change.mutate(parentId);
              }}
            />
            {ticket.parent ? (
              <ParentLine detail={detail} onOpen={onOpen} />
            ) : (
              <p className="text-xs text-zinc-500">
                A ticket with a parent starts only once the parent is done, from its branch.
              </p>
            )}
          </div>
        ) : (
          <ParentLine detail={detail} onOpen={onOpen} />
        )}
      </div>
      <ErrorText error={change.error} />
      {children.length > 0 ? (
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-zinc-500">Needed by</span>
          <ul className="space-y-1">
            {children.map((child) => (
              <li key={child.id}>
                <RefLink target={child} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
