// What still runs a custom agent: project flow presets that name it, tickets not yet done whose flow has
// it, and its review runs waiting or running.

import { and, eq, inArray } from 'drizzle-orm';

import type { Db } from './db';
import { projectPresets } from './flows';
import * as schema from './schema/schema';
import { reviewAgentRuns } from './schema/schema-review-agent-runs';
import { customAgentId, type CustomStep } from './states';

function presetUsers(db: Db, step: CustomStep): string[] {
  return db
    .select()
    .from(schema.projects)
    .all()
    .flatMap((project) =>
      projectPresets(project.config)
        .filter((preset) => preset.steps.includes(step))
        .map((preset) => `the ${preset.name} flow of ${project.owner}/${project.repo}`),
    );
}

function ticketUsers(db: Db, step: CustomStep): string[] {
  return db
    .select({ id: schema.tickets.id, phase: schema.tickets.phase, flow: schema.tickets.flow })
    .from(schema.tickets)
    .all()
    .filter(
      (ticket) =>
        ticket.phase.kind !== 'done' &&
        ticket.phase.kind !== 'cancelled' &&
        ticket.flow?.includes(step) === true,
    )
    .map((ticket) => `ticket #${ticket.id}`);
}

function reviewRunUsers(db: Db, step: CustomStep): string[] {
  const active = db
    .select({ id: reviewAgentRuns.id })
    .from(reviewAgentRuns)
    .where(
      and(
        eq(reviewAgentRuns.agentId, customAgentId(step)),
        inArray(reviewAgentRuns.status, ['queued', 'running']),
      ),
    )
    .all();
  return active.length === 0 ? [] : [`its review run ${active.map((run) => run.id).join(', ')}`];
}

/** Who still runs `step`, as the refusal names them; empty when it can go. */
export function customAgentUsers(db: Db, step: CustomStep): string[] {
  return [...presetUsers(db, step), ...ticketUsers(db, step), ...reviewRunUsers(db, step)];
}
