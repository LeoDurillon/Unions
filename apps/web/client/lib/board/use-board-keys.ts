// The board's keys while no ticket is open: / goes to the search, n opens the first ticket that needs the user.

import type { RefObject } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { useUrlParam } from '../app/url-state';
import { useShortcuts } from '../ui/shortcuts';
import { nextNeedingYou } from './next-needing';

export function useBoardKeys(
  tickets: TicketSummary[],
  search: RefObject<HTMLInputElement | null>,
  onOpen: (id: number) => void,
): void {
  const first = nextNeedingYou(tickets, null);
  useShortcuts(
    {
      '/': () => {
        search.current?.focus();
      },
      n: first
        ? () => {
            onOpen(first.id);
          }
        : undefined,
    },
    useUrlParam('ticket') === null,
  );
}
