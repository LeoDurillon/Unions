// Whose workspace a preview or a command runs in: a ticket's, or a pull request's under review; browser-safe.

/** A ticket, or a pull request under review (`current_reviews.id`). */
export type WorkspaceOwner = { ticketId: number } | { reviewId: number };

/** The owner columns of a row: exactly one of them is set. */
export type OwnerColumns = { ticketId: number | null; reviewId: number | null };

/** What `{ticket.id}` renders: `12` for ticket 12, `r3` for review 3 (their ids collide). */
export function ownerHostId(owner: WorkspaceOwner): string {
  return 'ticketId' in owner ? String(owner.ticketId) : `r${owner.reviewId}`;
}

/** The prefix of the owner's Docker names and preview hosts: `t12`, `r3` (`union-t12`, `t12.union.localhost`). */
export function ownerKey(owner: WorkspaceOwner): string {
  return 'ticketId' in owner ? `t${owner.ticketId}` : `r${owner.reviewId}`;
}

export function ownerColumns(owner: WorkspaceOwner): OwnerColumns {
  return 'ticketId' in owner
    ? { ticketId: owner.ticketId, reviewId: null }
    : { ticketId: null, reviewId: owner.reviewId };
}

/** The owner a row belongs to; throws on a row with neither (the tables' checks forbid it). */
export function ownerOf(row: OwnerColumns): WorkspaceOwner {
  if (row.ticketId !== null) {
    return { ticketId: row.ticketId };
  }
  if (row.reviewId !== null) {
    return { reviewId: row.reviewId };
  }
  throw new Error('The row has no ticket and no review');
}

/** The ticket a row belongs to; null for a pull request's. */
export function ticketOwnerId(owner: WorkspaceOwner): number | null {
  return 'ticketId' in owner ? owner.ticketId : null;
}

/** The owner's own container and its volumes: `union-t12` (`-home`, `-ws`), `union-r3`. */
export function ownerContainerNames(owner: WorkspaceOwner): {
  name: string;
  homeVolume: string;
  workspaceVolume: string;
} {
  const name = `union-${ownerKey(owner)}`;
  return { name, homeVolume: `${name}-home`, workspaceVolume: `${name}-ws` };
}
