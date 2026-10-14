import {
  activePreviews,
  DEFAULT_IDLE_STOP_MINUTES,
  getTicket,
  schema,
  type Db,
  type Preview,
} from '@union/core';
import { eq } from 'drizzle-orm';

const MS_PER_MINUTE = 60_000;
const CHECK_EVERY_MS = MS_PER_MINUTE;
const METRICS_TIMEOUT_MS = 5000;
/** `traefik_router_requests_total{…,router="union-t12-api@docker",…} 42` */
const ROUTER_LINE =
  /^traefik_router_requests_total\{[^}]*router="union-t(?<ticket>\d+)-[^"]*"[^}]*\}\s+(?<count>[\d.e+]+)/u;

/** Requests the proxy served per ticket (all its exposed services), from Traefik's metrics. */
export function requestsByTicket(metrics: string): Map<number, number> {
  const totals = new Map<number, number>();
  for (const line of metrics.split('\n')) {
    const groups = ROUTER_LINE.exec(line)?.groups;
    if (groups?.ticket !== undefined && groups.count !== undefined) {
      const ticket = Number(groups.ticket);
      totals.set(ticket, (totals.get(ticket) ?? 0) + Number(groups.count));
    }
  }
  return totals;
}

/** Traefik's metrics (`UNION_PREVIEW_METRICS`), or null when they cannot be read: nothing stops then. */
export async function readProxyMetrics(
  url: string | undefined = process.env.UNION_PREVIEW_METRICS,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!url) {
    return null;
  }
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(METRICS_TIMEOUT_MS) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export type IdleDeps = {
  db: Db;
  readMetrics: () => Promise<string | null>;
  /** Stops a preview that had no visit for `minutes` (through the manager: never during a start). */
  stopIdle: (ticketId: number, minutes: number) => void;
  /** The ticket whose e2e tests run now, if any. */
  testing: () => number | null;
  now?: () => number;
};

function idleMinutes(db: Db, preview: Preview): number {
  const ticket = getTicket(db, preview.ticketId);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  return project?.config.preview?.idleStopMinutes ?? DEFAULT_IDLE_STOP_MINUTES;
}

/**
 * Stops running previews nobody visited for the project's idle time. A visit is a request the proxy
 * served to one of the preview's services; the clock starts again at each one, at each start, and
 * at each worker start (it cannot know what happened before). A preview whose ticket is in a step,
 * or whose e2e tests run, is in use whatever the visits.
 */
export class IdleWatcher {
  private readonly seen = new Map<number, { total: number; at: number }>();
  private lastCheck = 0;
  private checking = false;

  constructor(private readonly deps: IdleDeps) {}

  tick(): void {
    const now = (this.deps.now ?? Date.now)();
    if (this.checking || now - this.lastCheck < CHECK_EVERY_MS) {
      return;
    }
    this.lastCheck = now;
    void this.checkOnce(now);
  }

  private async checkOnce(now: number): Promise<void> {
    this.checking = true;
    try {
      await this.check(now);
    } finally {
      this.checking = false;
    }
  }

  private inUse(preview: Preview, total: number, now: number): boolean {
    const last = this.seen.get(preview.ticketId);
    const busy =
      getTicket(this.deps.db, preview.ticketId).phase.kind === 'running' ||
      this.deps.testing() === preview.ticketId;
    const restarted = last !== undefined && (preview.startedAt ?? 0) > last.at;
    if (!last || last.total !== total || busy || restarted) {
      this.seen.set(preview.ticketId, { total, at: now });
      return true;
    }
    return false;
  }

  async check(now: number): Promise<void> {
    const metrics = await this.deps.readMetrics();
    if (metrics === null) {
      return;
    }
    const totals = requestsByTicket(metrics);
    const running = activePreviews(this.deps.db).filter((row) => row.status === 'running');
    for (const id of this.seen.keys()) {
      if (!running.some((row) => row.ticketId === id)) {
        this.seen.delete(id);
      }
    }
    for (const preview of running) {
      const minutes = idleMinutes(this.deps.db, preview);
      const since = this.seen.get(preview.ticketId)?.at ?? now;
      if (
        !this.inUse(preview, totals.get(preview.ticketId) ?? 0, now) &&
        minutes > 0 &&
        now - since >= minutes * MS_PER_MINUTE
      ) {
        this.seen.delete(preview.ticketId);
        this.deps.stopIdle(preview.ticketId, minutes);
      }
    }
  }
}
