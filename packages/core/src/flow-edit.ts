// Editing a flow in the settings or a ticket's Custom flow: planning steps on or off, custom agents added and moved; browser-safe.
import {
  isCustomStep,
  pipelineIndex,
  type CustomStep,
  type Flow,
  type PipelineStep,
} from './states';

/**
 * `planning` turned on or off. Turned on, it goes before the first built-in step that comes after it
 * in pipeline order, so the custom steps keep their places.
 */
export function withPlanning(flow: Flow, planning: PipelineStep, on: boolean): PipelineStep[] {
  const without = flow.filter((step) => step !== planning);
  if (!on) {
    return without;
  }
  const at = without.findIndex(
    (step) => !isCustomStep(step) && pipelineIndex(step) > pipelineIndex(planning),
  );
  return at === -1 ? [...without, planning] : without.toSpliced(at, 0, planning);
}

/** `step` added just before the implementation, where a planning step would run. */
export function withCustomStep(flow: Flow, step: CustomStep): PipelineStep[] {
  if (flow.includes(step)) {
    return [...flow];
  }
  const at = flow.indexOf('implement');
  return at === -1 ? [...flow, step] : flow.toSpliced(at, 0, step);
}

export function withoutStep(flow: Flow, step: PipelineStep): PipelineStep[] {
  return flow.filter((kept) => kept !== step);
}

/** Whether `step` can move one place up (-1) or down (1): never to or past the final review. */
export function canMove(flow: Flow, step: CustomStep, by: -1 | 1): boolean {
  const at = flow.indexOf(step);
  const to = at + by;
  const last = flow.indexOf('final_review');
  return at !== -1 && to >= 0 && to < (last === -1 ? flow.length : last);
}

/** `step` swapped with its neighbour; the flow unchanged when it cannot move there. */
export function movedStep(flow: Flow, step: CustomStep, by: -1 | 1): PipelineStep[] {
  if (!canMove(flow, step, by)) {
    return [...flow];
  }
  const at = flow.indexOf(step);
  const next = [...flow];
  [next[at], next[at + by]] = [flow[at + by] ?? step, step];
  return next;
}
