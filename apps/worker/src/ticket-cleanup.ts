// Removes what a finished ticket holds in Docker (its preview with its built images, its container
// and volumes) once nothing comes back to it: its pull request merged, or the ticket cancelled.
import { emitEvent, schema, type ContainerRuntime, type Db, type Ticket } from '@union/core';
import { eq, isNotNull, sql } from 'drizzle-orm';

const CHECK_EVERY_MS = 60_000;

/** The work that may use a ticket's container or preview, and the column naming the ticket. */
const TICKET_WORK: [table: string, column: string][] = [
  ['runs', 'ticket_id'],
  ['investigations', 'on_ticket_id'],
  ['agent_reviews', 'ticket_id'],
  ['pr_descriptions', 'ticket_id'],
  ['review_groupings', 'ticket_id'],
  ['review_explanations', 'ticket_id'],
  ['review_reports', 'ticket_id'],
  ['review_agent_runs', 'ticket_id'],
  ['container_runs', 'ticket_id'],
  ['previews', 'ticket_id'],
];

const MESSAGES = {
  merged: 'The pull request is merged: the preview, the container and its volumes were removed',
  cancelled: 'The ticket is cancelled: the preview, the container and its volumes were removed',
} as const;

type Reason = keyof typeof MESSAGES;

/** Merged (a stack once every slice is) or cancelled: neither comes back. */
export function finishedReason(ticket: Pick<Ticket, 'phase' | 'prState'>): Reason | null {
  if (ticket.phase.kind === 'cancelled') {
    return 'cancelled';
  }
  return ticket.prState === 'merged' ? 'merged' : null;
}

/** A step, a side run, a preview command or e2e tests on the ticket, or a command not handled yet. */
function hasWork(db: Db, ticket: Ticket): boolean {
  if (ticket.phase.kind === 'running') {
    return true;
  }
  const busy = TICKET_WORK.map(
    ([table, column]) =>
      sql`select 1 from ${sql.identifier(table)} where ${sql.identifier(column)} = ${ticket.id} and status in ('queued', 'running', 'starting', 'stopping')`,
  );
  const e2e = sql`select 1 from previews where ticket_id = ${ticket.id} and e2e_status = 'running'`;
  const commands = sql`select 1 from commands where ticket_id = ${ticket.id} and handled_at is null`;
  const found = db.get(sql`${sql.join([...busy, e2e, commands], sql` union all `)} limit 1`);
  return found !== undefined;
}

export type TicketCleanupDeps = {
  db: Db;
  runtime: ContainerRuntime;
  /** Takes the ticket's preview down with its built images; false while it is busy. */
  removePreview: (ticketId: number) => Promise<boolean>;
  now?: () => number;
};

/** Finished tickets that still hold a container, and nothing runs on. */
export function ticketsToClean(db: Db): (Ticket & { reason: Reason })[] {
  return db
    .select()
    .from(schema.tickets)
    .where(isNotNull(schema.tickets.containerName))
    .all()
    .flatMap((ticket) => {
      const reason = finishedReason(ticket);
      return reason !== null && !hasWork(db, ticket) ? [{ ...ticket, reason }] : [];
    });
}

/** Removes one finished ticket's preview, container and volumes; false when its preview was busy. */
export async function cleanUpTicket(
  deps: TicketCleanupDeps,
  ticket: Ticket & { reason: Reason },
): Promise<boolean> {
  const { containerName, homeVolume, workspaceVolume } = ticket;
  if (!(await deps.removePreview(ticket.id))) {
    return false;
  }
  if (containerName !== null) {
    const volumes =
      homeVolume !== null && workspaceVolume !== null
        ? { home: homeVolume, workspace: workspaceVolume }
        : undefined;
    await deps.runtime.remove(containerName, volumes);
  }
  deps.db
    .update(schema.tickets)
    .set({ containerName: null, homeVolume: null, workspaceVolume: null })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(deps.db, {
    type: 'ticket_workspace_removed',
    ticketId: ticket.id,
    payload: { reason: ticket.reason, message: MESSAGES[ticket.reason] },
  });
  return true;
}

/**
 * Every minute, removes what finished tickets hold in Docker, one at a time. A failure is logged
 * once and that ticket is left until the worker restarts.
 */
export class TicketCleanup {
  private lastCheck = 0;
  private pass: Promise<void> | null = null;
  private readonly failed = new Set<number>();

  constructor(private readonly deps: TicketCleanupDeps) {}

  tick(): void {
    const now = (this.deps.now ?? Date.now)();
    if (this.pass !== null || now - this.lastCheck < CHECK_EVERY_MS) {
      return;
    }
    this.lastCheck = now;
    this.pass = this.checkOnce();
  }

  private async checkOnce(): Promise<void> {
    try {
      await this.check();
    } finally {
      this.pass = null;
    }
  }

  async check(): Promise<void> {
    for (const ticket of ticketsToClean(this.deps.db)) {
      if (!this.failed.has(ticket.id)) {
        await this.cleanUp(ticket);
      }
    }
  }

  async idle(): Promise<void> {
    await this.pass;
  }

  private async cleanUp(ticket: Ticket & { reason: Reason }): Promise<void> {
    try {
      await cleanUpTicket(this.deps, ticket);
    } catch (error) {
      this.failed.add(ticket.id);
      emitEvent(this.deps.db, {
        type: 'container_cleanup_failed',
        ticketId: ticket.id,
        payload: {
          container: ticket.containerName ?? `union-t${ticket.id}`,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
