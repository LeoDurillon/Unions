// A ticket's newest diff for the review page: its snapshot, its files with their flags, and whether a review can be sent now.
import { schema, type Db, type Ticket } from '@union/core';
import { desc, eq } from 'drizzle-orm';

import type { DiffResponse } from '../../api-types';
import { projectFileFlags } from './file-flags';

/** The ticket's newest diff snapshot. */
export function latestSnapshot(
  db: Db,
  ticketId: number,
): typeof schema.diffSnapshots.$inferSelect | undefined {
  return db
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
}

/**
 * Why a review cannot be sent now, or null when it can: the ticket waits on the user after code was
 * written, or it is done with its branch kept and its pull request not merged (the implementer then
 * works on it and the final review runs again).
 */
export function sendRefusal(ticket: Ticket): string | null {
  const { phase } = ticket;
  if (phase.kind === 'done') {
    if (ticket.branch === null) {
      return 'This ticket has no branch to review.';
    }
    return ticket.prState === 'merged'
      ? 'The pull request is merged: open a new ticket for further changes.'
      : null;
  }
  const waiting =
    phase.kind === 'awaiting_approval' &&
    (phase.step === 'implement' || phase.step === 'final_review');
  return waiting
    ? null
    : 'Sending opens when the ticket waits on you at the implementation or the final review, or once it is done.';
}

/** The ticket's newest diff: its files, flagged, and whether a review can be sent. */
export function diffResponse(db: Db, ticket: Ticket): DiffResponse {
  const snapshot = latestSnapshot(db, ticket.id);
  const flags = projectFileFlags(db, ticket.projectId);
  const files = snapshot
    ? db
        .select()
        .from(schema.diffFiles)
        .where(eq(schema.diffFiles.snapshotId, snapshot.id))
        .orderBy(schema.diffFiles.position)
        .all()
        .map(({ patch: _patch, snapshotId: _snapshot, position: _position, ...summary }) =>
          Object.assign(summary, flags(summary)),
        )
    : [];
  const body: DiffResponse = {
    snapshot: snapshot
      ? {
          headSha: snapshot.headSha,
          baseBranch: snapshot.baseBranch,
          createdAt: snapshot.createdAt,
        }
      : null,
    files,
    canSend: sendRefusal(ticket) === null,
    sendRefusal: sendRefusal(ticket),
    pullRequest: ticket.prNumber,
  };
  return body;
}
