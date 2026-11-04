// The ticket panel's keys: Escape closes it, n / p open the next or previous ticket that needs the
// user, r opens the review, 1 to 4 switch its tabs.
import { useQuery } from '@tanstack/react-query';

import type { TicketDetail, TicketSummary } from '../../src/api-types';
import { api } from '../lib/api';
import { nextNeedingYou, othersNeedingYou } from '../lib/next-needing';
import { useShortcuts } from '../lib/shortcuts';
import type { Section } from './ticket-tabs';

/** The tickets around the open one that need the user, from the board's list (shared with the board). */
export type NeedingYou = {
  next: TicketSummary | null;
  previous: TicketSummary | null;
  others: number;
};

function useNeedingYou(ticket: TicketSummary | undefined): NeedingYou {
  const projectId = ticket?.projectId ?? 0;
  const tickets = useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.tickets(projectId),
    enabled: ticket !== undefined,
  });
  const list = tickets.data ?? [];
  const id = ticket?.id ?? null;
  return {
    next: nextNeedingYou(list, id),
    previous: nextNeedingYou(list, id, -1),
    others: othersNeedingYou(list, id),
  };
}

const SECTION_KEYS: Record<string, Section> = {
  '1': 'overview',
  '2': 'preview',
  '3': 'worker',
  '4': 'pull-request',
};

/** Listens while the panel shows (not its review page); returns the tickets `n` and `p` open. */
export function usePanelKeys({
  detail,
  enabled,
  actions: { onClose, onOpenTicket, onReview, onSection },
}: {
  detail: TicketDetail | undefined;
  enabled: boolean;
  actions: {
    onClose: () => void;
    onOpenTicket: (id: number) => void;
    onReview: () => void;
    onSection: (section: Section) => void;
  };
}): NeedingYou {
  const needing = useNeedingYou(detail?.ticket);
  const open = (ticket: TicketSummary | null): (() => void) | undefined =>
    ticket
      ? () => {
          onOpenTicket(ticket.id);
        }
      : undefined;
  const sections = Object.fromEntries(
    Object.entries(SECTION_KEYS).map(([key, section]) => [
      key,
      detail
        ? () => {
            onSection(section);
          }
        : undefined,
    ]),
  );
  useShortcuts(
    {
      Escape: onClose,
      n: open(needing.next),
      p: open(needing.previous),
      r: detail?.ticket.branch ? onReview : undefined,
      ...sections,
    },
    enabled,
  );
  return needing;
}
