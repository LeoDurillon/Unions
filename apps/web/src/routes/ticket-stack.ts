// A split ticket's stack as the API shows it: its slices, what merged where, and whether a restack is due.
import {
  listSlices,
  schema,
  stackLabel,
  stackStatus,
  ticketBase,
  type Db,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { StackView } from '../api-types';

/** The ticket's stack; null when it is not split. */
export function stackView(db: Db, ticket: Ticket): StackView | null {
  const slices = listSlices(db, ticket.id);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  if (slices.length < 2 || !project) {
    return null;
  }
  const base = ticketBase(project, ticket);
  const status = stackStatus(slices, base);
  const firstOpen = slices.findIndex((slice) => slice.prState !== 'merged');
  const below = firstOpen > 0 ? slices[firstOpen - 1] : undefined;
  // Restacked: the open slice's tip no longer holds the merged one's (recorded at the push).
  const restackable = below?.mergedInto === base && below.mergedTipSha !== null && !status.complete;
  return {
    label: stackLabel(status),
    slices: slices.map(({ position, title, branch, prNumber, prState, mergedInto }) => ({
      position,
      title,
      branch,
      prNumber,
      prState,
      mergedInto,
    })),
    outOfOrder: status.outOfOrder,
    closed: status.closed,
    restackable,
  };
}
