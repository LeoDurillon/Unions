// The open ticket, and whether its review is open, live in the URL (`?ticket=3&review=1`), so they
// survive reloads and back/forward.
import { useCallback } from 'react';

import { setParams, useUrlParam } from './url-state';

function ticketIdOf(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The open ticket lives in the URL (`?ticket=3`), so it survives reloads and back/forward. */
export function useSelectedTicket(): [number | null, (id: number | null) => void] {
  const ticketId = ticketIdOf(useUrlParam('ticket'));
  const select = useCallback((id: number | null): void => {
    setParams({ ticket: id === null ? null : String(id), review: null });
  }, []);
  return [ticketId, select];
}

/** Whether the open ticket shows its review page (`?review=1`); Back leaves it. */
export function useTicketReview(): [boolean, (open: boolean) => void] {
  const open = useUrlParam('review') === '1';
  const set = useCallback((next: boolean): void => {
    setParams({ review: next ? '1' : null });
  }, []);
  return [open, set];
}
