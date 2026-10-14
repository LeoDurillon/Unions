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
    setParams({ ticket: id === null ? null : String(id) });
  }, []);
  return [ticketId, select];
}
