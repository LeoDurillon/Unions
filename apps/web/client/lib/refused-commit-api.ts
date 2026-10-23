// The ticket's last refused commit, or null.
import type { RefusedCommit } from '@union/core';

import { request } from './api';

/** The ticket's last refused commit, or null. */
export function fetchRefusedCommit(ticketId: number): Promise<RefusedCommit | null> {
  return request('GET', `/api/tickets/${ticketId}/refused-commit`);
}
