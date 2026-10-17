// Ticket flows: the steps a ticket runs, the presets a project offers, and what agents are told of skipped steps.
import type { ProjectConfig } from './schema-types';
import {
  FULL_FLOW,
  PLANNING_STEPS,
  STEP_TITLES,
  STEPS,
  type Flow,
  type PipelineStep,
  type Step,
} from './states';

/** A named flow the user picks for a ticket; `id` is what `ProjectConfig.defaultFlow` names. */
export type FlowPreset = { id: string; name: string; steps: PipelineStep[] };

export const BUILT_IN_PRESETS: readonly FlowPreset[] = [
  { id: 'full', name: 'Full', steps: [...FULL_FLOW] },
  { id: 'standard', name: 'Standard', steps: ['technical', 'implement', 'final_review'] },
  { id: 'quick', name: 'Quick', steps: ['implement', 'final_review'] },
];

const DEFAULT_PRESET = 'full';

/** Every flow ends with these: the final review's approval is what finishes a ticket. */
const REQUIRED_STEPS: readonly PipelineStep[] = ['implement', 'final_review'];

export function isPipelineStep(value: unknown): value is PipelineStep {
  return FULL_FLOW.some((step) => step === value);
}

/** What makes `value` no flow: not a list, unknown or repeated steps, out of order, a required step missing. */
export function flowProblems(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ['A flow is a list of steps'];
  }
  const steps: unknown[] = value;
  const unknown = steps.filter((step) => !isPipelineStep(step));
  if (unknown.length > 0) {
    return [`Unknown steps: ${unknown.map((step) => JSON.stringify(step)).join(', ')}`];
  }
  const problems: string[] = [];
  const order = steps.filter((step) => isPipelineStep(step)).map((step) => STEPS.indexOf(step));
  if (order.some((at, index) => index > 0 && at <= (order[index - 1] ?? -1))) {
    problems.push('Steps must appear once each, in pipeline order');
  }
  for (const step of REQUIRED_STEPS) {
    if (!steps.includes(step)) {
      problems.push(`Every flow runs ${STEP_TITLES[step]}`);
    }
  }
  return problems;
}

export function isFlow(value: unknown): value is PipelineStep[] {
  return flowProblems(value).length === 0;
}

/** The project's presets: its own list when it has one, else the built-in ones. */
export function projectPresets(config: ProjectConfig): readonly FlowPreset[] {
  return config.flows ?? BUILT_IN_PRESETS;
}

export function sameFlow(a: Flow, b: Flow): boolean {
  return a.length === b.length && a.every((step, index) => step === b[index]);
}

/** The name of the project's preset with these steps, else "Custom". */
export function flowName(flow: Flow, config: ProjectConfig): string {
  return projectPresets(config).find((preset) => sameFlow(preset.steps, flow))?.name ?? 'Custom';
}

/** The flow a ticket starts with: its own, else the project's default preset, else every step. */
export function resolveFlow(ticket: { flow: Flow | null }, config: ProjectConfig): Flow {
  if (ticket.flow !== null) {
    return ticket.flow;
  }
  const id = config.defaultFlow ?? DEFAULT_PRESET;
  return projectPresets(config).find((preset) => preset.id === id)?.steps ?? FULL_FLOW;
}

const OWN_NOTE: Partial<Record<Step, string>> = {
  implement: 'Where your instructions refer to them, work from the ticket itself.',
  final_review: 'Review the change against the ticket itself, and do not report them as missing.',
};

const NO_TEST_PLAN: Partial<Record<Step, string>> = {
  implement:
    'There is no test plan: add the tests this change needs, at the level the project already tests this behaviour.',
  final_review: 'There is no test plan: judge whether the change has the tests it needs.',
};

/** The `# Flow` section the implementer and the final review get when planning steps were skipped. */
export function flowNote(flow: Flow, step: Step): string {
  const own = OWN_NOTE[step];
  const skipped = PLANNING_STEPS.filter((planning) => !flow.includes(planning));
  if (own === undefined || skipped.length === 0) {
    return '';
  }
  const which =
    skipped.length === PLANNING_STEPS.length
      ? 'The user chose to skip planning for this ticket: no description, summary, technical plan or test plan was written.'
      : `The user chose to skip these planning steps for this ticket, so they have no output: ${skipped.map((planning) => STEP_TITLES[planning]).join(', ')}.`;
  const tests = skipped.includes('test_plan') ? NO_TEST_PLAN[step] : undefined;
  return `# Flow\n\n${[which, own, tests].filter((part) => part !== undefined).join(' ')}`;
}
