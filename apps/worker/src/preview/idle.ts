// Stops running previews nobody visited for the project's idle time.
import {
  activePreviews,
  DEFAULT_IDLE_STOP_MINUTES,
  getTicket,
  ownerKey,
  previewOwner,
  schema,
  type Db,
  type Preview,
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

const MS_PER_MINUTE = 60_000;
const CHECK_EVERY_MS = MS_PER_MINUTE;
const METRICS_TIMEOUT_MS = 5000;
/** `traefik_router_requests_total{…,router="union-t12-api@docker",…} 42` (`union-r3-…`: a review's) */
const ROUTER_LINE =
  /^traefik_router_requests_total\{[^}]*router="union-(?<owner>[tr]\d+)-[^"]*"[^}]*\}\s+(?<count>[\d.e+]+)/u;

/**
 * Requests the proxy served per preview (all its exposed services), from Traefik's metrics, by
 * owner key (`t12`, `r3`).
 */
export function requestsByOwner(metrics: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of metrics.split('\n')) {
    const groups = ROUTER_LINE.exec(line)?.groups;
    if (groups?.owner !== undefined && groups.count !== undefined) {
      totals.set(groups.owner, (totals.get(groups.owner) ?? 0) + Number(groups.count));
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
  stopIdle: (owner: WorkspaceOwner, minutes: number) => void;
  /** The owner key (`t12`, `r3`) whose e2e tests run now, if any. */
  testing: () => string | null;
  now?: () => number;
};

function idleMinutes(db: Db, preview: Preview): number {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, preview.projectId))
    .get();
  return project?.config.preview?.idleStopMinutes ?? DEFAULT_IDLE_STOP_MINUTES;
}

/**
 * Stops running previews nobody visited for the project's idle time. A visit is a request the proxy
 * served to one of the preview's services; the clock starts again at each one, at each start, and
 * at each worker start (it cannot know what happened before). A preview whose ticket is in a step,
 * or whose e2e tests run, is in use whatever the visits. Keyed by owner key (`t12`, `r3`).
 */
export class IdleWatcher {
  private readonly seen = new Map<string, { total: number; at: number }>();
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

  private inUse(preview: Preview, key: string, total: number, now: number): boolean {
    const last = this.seen.get(key);
    const stepping =
      preview.ticketId !== null &&
      getTicket(this.deps.db, preview.ticketId).phase.kind === 'running';
    const busy = stepping || this.deps.testing() === key;
    const restarted = last !== undefined && (preview.startedAt ?? 0) > last.at;
    if (!last || last.total !== total || busy || restarted) {
      this.seen.set(key, { total, at: now });
      return true;
    }
    return false;
  }

  async check(now: number): Promise<void> {
    const metrics = await this.deps.readMetrics();
    if (metrics === null) {
      return;
    }
    const totals = requestsByOwner(metrics);
    const running = activePreviews(this.deps.db)
      .filter((row) => row.status === 'running')
      .map((row) => ({ row, owner: previewOwner(row), key: ownerKey(previewOwner(row)) }));
    for (const key of this.seen.keys()) {
      if (!running.some((preview) => preview.key === key)) {
        this.seen.delete(key);
      }
    }
    for (const { row, owner, key } of running) {
      const minutes = idleMinutes(this.deps.db, row);
      const since = this.seen.get(key)?.at ?? now;
      if (
        !this.inUse(row, key, totals.get(key) ?? 0, now) &&
        minutes > 0 &&
        now - since >= minutes * MS_PER_MINUTE
      ) {
        this.seen.delete(key);
        this.deps.stopIdle(owner, minutes);
      }
    }
  }
}
