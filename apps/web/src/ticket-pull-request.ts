// The pull request a ticket's PR tab reads: its own, or one of its stack's slices' picked with `?pr=`.
import { listSlices, type Db, type Ticket } from '@union/core';
import type { Context } from 'hono';

import { CONFLICT, fail, NOT_FOUND, requireId } from './http';

/** `?pr=` must be the ticket's pull request or a slice's; absent, the ticket's own. */
export function pickedPullRequest(db: Db, ticket: Ticket, c: Context): number {
  if (ticket.prNumber === null) {
    throw fail(CONFLICT, 'Link a pull request to this ticket first');
  }
  const asked = c.req.query('pr');
  if (asked === undefined) {
    return ticket.prNumber;
  }
  const number = requireId(asked, 'pull request number');
  const ours =
    number === ticket.prNumber ||
    listSlices(db, ticket.id).some((slice) => slice.prNumber === number);
  if (!ours) {
    throw fail(NOT_FOUND, `#${number} is not a pull request of this ticket's stack`);
  }
  return number;
}
