// The work in progress a restart interrupts, per table: `bun run active` and the Update dialog list it.
import { sql } from 'drizzle-orm';

import type { Db } from './db';

/** What a worker restart does to it, said to the user before Update anyway. */
export type RestartEffect = 'restarts' | 'fails';

export type ActiveWorkKind = {
  table: string;
  where: string;
  label: string;
  onRestart: RestartEffect;
};

/** Rows that mean work in progress. A ticket's step runs again; the rest end as failed (interrupted). */
export const ACTIVE_WORK: ActiveWorkKind[] = [
  { table: 'runs', where: "status = 'running'", label: 'ticket step', onRestart: 'restarts' },
  {
    table: 'investigations',
    where: "status in ('queued','running') or ticket_status in ('queued','running')",
    label: 'investigation',
    onRestart: 'fails',
  },
  {
    table: 'agent_reviews',
    where: "status in ('queued','running')",
    label: 'agent review',
    onRestart: 'fails',
  },
  {
    table: 'review_groupings',
    where: "status in ('queued','running')",
    label: 'grouping by spec',
    onRestart: 'fails',
  },
  {
    table: 'pr_descriptions',
    where: "status in ('queued','running','sending')",
    label: 'PR description',
    onRestart: 'fails',
  },
  {
    table: 'previews',
    where: "status in ('starting','stopping') or e2e_status = 'running'",
    label: 'preview starting, stopping or testing',
    onRestart: 'fails',
  },
  {
    table: 'container_runs',
    where: "status in ('queued','running')",
    label: 'command',
    onRestart: 'fails',
  },
];

export type ActiveWork = { label: string; count: number; onRestart: RestartEffect };

/** The kinds with work in progress now, with how many rows each. */
export function activeWork(db: Db): ActiveWork[] {
  return ACTIVE_WORK.map((kind) => {
    const rows = db.all<{ n: number }>(
      sql.raw(`select count(*) as n from ${kind.table} where ${kind.where}`),
    );
    return { label: kind.label, count: rows[0]?.n ?? 0, onRestart: kind.onRestart };
  }).filter((work) => work.count > 0);
}
