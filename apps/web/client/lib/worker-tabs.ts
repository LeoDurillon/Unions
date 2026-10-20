// The Worker tab's own tabs: a step's in the ticket's flow order (custom agents named), the on-demand ones, the log.
import type { CustomAgentNames } from '@union/core';
import { withPlanning } from '@union/core/flow-edit';
import { resolveFlow } from '@union/core/flows';
import { STEPS, type PipelineStep, type Step } from '@union/core/states';
import { stepTitle } from '@union/core/step-titles';

import type { TicketDetail } from '../../src/api-types';
import { currentStep } from './labels';

/** The Worker tab's own tabs: one per step, then the log. */
export type WorkerTab = 'log' | Step;

export type WorkerTabEntry = { id: WorkerTab; label: string; enabled: boolean };

/** The ticket's steps in its flow's order, with the built-in ones it skips but ran before in their place. */
function stepsOf(detail: TicketDetail): Step[] {
  const flow = resolveFlow(detail.ticket, detail.project.config);
  const ran = (step: Step): boolean => detail.outputs.some((output) => output.step === step);
  // A step the flow skips has no tab, unless it has output from before.
  return STEPS.filter((step) => !flow.includes(step) && ran(step)).reduce<PipelineStep[]>(
    (steps, skipped) => withPlanning(steps, skipped, true),
    [...flow],
  );
}

/** Where the Worker tab opens when no step runs: the furthest step with output, else the log. */
export function latestWorkerTab(detail: TicketDetail): WorkerTab {
  const done = stepsOf(detail).filter((step) =>
    detail.outputs.some((output) => output.step === step),
  );
  return done.at(-1) ?? 'log';
}

export function workerTabsFor(detail: TicketDetail, names: CustomAgentNames): WorkerTabEntry[] {
  const active = currentStep(detail.ticket.phase);
  const ran = (step: Step): boolean => detail.outputs.some((output) => output.step === step);
  const steps = stepsOf(detail).map((step) => ({
    id: step,
    label: stepTitle(step, names),
    enabled: step === active || ran(step),
  }));
  // Rebase, simplify and the split are not pipeline steps: their tab appears once one ran or runs.
  const onDemand = (['rebase', 'simplify', 'split_plan', 'split', 'restack'] as const)
    .filter((step) => step === active || detail.outputs.some((output) => output.step === step))
    .map((step) => ({ id: step, label: stepTitle(step), enabled: true }));
  return [...steps, ...onDemand, { id: 'log', label: 'Log', enabled: true }];
}
