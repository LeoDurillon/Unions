// What still runs a custom agent: project flow presets that name it, and tickets not yet done whose flow has it.
import type { Db } from './db';
import { projectPresets } from './flows';
import * as schema from './schema';
import type { CustomStep } from './states';

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

/** Who still runs `step`, as the refusal names them; empty when it can go. */
export function customAgentUsers(db: Db, step: CustomStep): string[] {
  return [...presetUsers(db, step), ...ticketUsers(db, step)];
}
