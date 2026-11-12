// The ticket panel's keys: Escape closes it, r opens the review, 1 to 5 switch its tabs. n / p open
// the next or previous ticket that needs the user.

import { useQuery } from '@tanstack/react-query';

import type { TicketDetail, TicketSummary } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { nextNeedingYou, othersNeedingYou } from '../../lib/board/next-needing';
import { useShortcuts } from '../../lib/ui/shortcuts';
import { trackerSection } from '../tracker/tracker-tab';
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

/** `tracker`: the fifth tab, the Notion or Jira one the ticket has (`trackerSection`). */
const SECTION_KEYS: Record<string, Section | 'tracker'> = {
  '1': 'overview',
  '2': 'preview',
  '3': 'worker',
  '4': 'pull-request',
  '5': 'tracker',
};

/** The tab a key opens on this ticket, or null when it is disabled. */
function keySection(section: Section | 'tracker', ticket: TicketSummary): Section | null {
  if (section !== 'tracker') {
    return section;
  }
  const tracker = trackerSection(ticket);
  return tracker.enabled ? tracker.id : null;
}

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
    Object.entries(SECTION_KEYS).map(([key, section]) => {
      const opened = detail ? keySection(section, detail.ticket) : null;
      return [
        key,
        opened === null
          ? undefined
          : () => {
              onSection(opened);
            },
      ];
    }),
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
