import { useCallback, useEffect, useState } from 'react';

function readTicketParam(): number | null {
  const value = new URLSearchParams(globalThis.location.search).get('ticket');
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The open ticket lives in the URL (`?ticket=3`), so it survives reloads and back/forward. */
export function useSelectedTicket(): [number | null, (id: number | null) => void] {
  const [ticketId, setTicketId] = useState(readTicketParam);

  useEffect(() => {
    const onPop = (): void => {
      setTicketId(readTicketParam());
    };
    globalThis.addEventListener('popstate', onPop);
    return () => {
      globalThis.removeEventListener('popstate', onPop);
    };
  }, []);

  const select = useCallback((id: number | null): void => {
    const url = new URL(globalThis.location.href);
    if (id === null) {
      url.searchParams.delete('ticket');
    } else {
      url.searchParams.set('ticket', String(id));
    }
    globalThis.history.pushState(null, '', url);
    setTicketId(id);
  }, []);

  return [ticketId, select];
}
