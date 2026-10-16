// The investigation opened from elsewhere (a notification), in the URL (`?investigation=<id>`).
import { setParams, useUrlParam } from './url-state';

/** Opens Investigations on the investigation; the ticket panel closes. */
export function openInvestigation(id: number): void {
  setParams({ investigation: String(id), investigate: null, ticket: null });
}

export function clearOpenedInvestigation(): void {
  setParams({ investigation: null });
}

/** The investigation to show, from the URL; null when none. */
export function useOpenedInvestigation(): number | null {
  const id = Number(useUrlParam('investigation'));
  return Number.isInteger(id) && id > 0 ? id : null;
}
