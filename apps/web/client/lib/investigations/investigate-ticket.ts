// Opens Investigations with a new investigation on the ticket ready to write (`?investigate=<id>`).

import { confirmLeave } from '../app/leave-guard';
import { setParams, useUrlParam } from '../app/url-state';
import { CLOSE_REVIEW } from '../review/review-url';

/** Opens Investigations with a new investigation on the ticket ready to write (`?investigate=<id>`). */
export function investigateTicket(ticketId: number): void {
  if (confirmLeave()) {
    setParams({ investigate: String(ticketId), ticket: null, ...CLOSE_REVIEW, settings: null });
  }
}

export function clearInvestigateTicket(): void {
  setParams({ investigate: null });
}

/** The ticket a new investigation was asked about, from the URL; null when none. */
export function useInvestigateTicket(): number | null {
  const id = Number(useUrlParam('investigate'));
  return Number.isInteger(id) && id > 0 ? id : null;
}
