// Each project's tickets that wait on the user and those running, for the sidebar: one read of the tickets.
import { schema, type Db } from '@union/core';
import { needsYou } from '@union/core/needs-you';

export type ProjectCounts = { needsYou: number; running: number };

const NONE: ProjectCounts = { needsYou: 0, running: 0 };

/** The counts by project id; a project without tickets is absent (`countsOf` gives it zeros). */
export function projectCounts(db: Db): Map<number, ProjectCounts> {
  const rows = db
    .select({
      projectId: schema.tickets.projectId,
      phase: schema.tickets.phase,
      prState: schema.tickets.prState,
      prChecksState: schema.tickets.prChecksState,
    })
    .from(schema.tickets)
    .all();
  const counts = new Map<number, ProjectCounts>();
  for (const row of rows) {
    const current = counts.get(row.projectId) ?? NONE;
    counts.set(row.projectId, {
      needsYou: current.needsYou + (needsYou(row) ? 1 : 0),
      running: current.running + (row.phase.kind === 'running' ? 1 : 0),
    });
  }
  return counts;
}

export function countsOf(counts: Map<number, ProjectCounts>, projectId: number): ProjectCounts {
  return counts.get(projectId) ?? NONE;
}
