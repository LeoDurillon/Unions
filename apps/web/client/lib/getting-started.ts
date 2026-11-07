// The getting-started checklist's steps, each ticked from what the project's tickets and settings say.
import type { BoardColumn, ProjectConfig } from '@union/core';

export const GETTING_STARTED_STEPS = ['checks', 'ticket', 'start', 'plan', 'review'] as const;

export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

type TicketState = { board: BoardColumn; phase: { kind: string } };

const PLANNED: readonly BoardColumn[] = ['in_review', 'done', 'merged'];
const REVIEWED: readonly BoardColumn[] = ['done', 'merged'];

/** Whether each step is done: a check command saved, a ticket written, started, planned, reviewed. */
export function gettingStarted(
  tickets: readonly TicketState[],
  config: Pick<ProjectConfig, 'gateCommand'>,
): Record<GettingStartedStep, boolean> {
  const reached = (columns: readonly BoardColumn[]): boolean =>
    tickets.some((ticket) => columns.includes(ticket.board));
  return {
    checks: (config.gateCommand ?? '').trim() !== '',
    ticket: tickets.length > 0,
    start: tickets.some((ticket) => ticket.phase.kind !== 'backlog'),
    plan: reached(PLANNED),
    review: reached(REVIEWED),
  };
}
