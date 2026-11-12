// A step's name as the UI, the notifications and the issue comments show it: built-in, or the
// custom agent's. Browser-safe.
import { isCustomStep, STEP_TITLES, type CustomStep, type Step } from './states';

/** The custom agents' names by step, deleted ones included (their tickets keep their tabs). */
export type CustomAgentNames = Readonly<Partial<Record<CustomStep, string>>>;

/** Shown for a custom step whose agent the caller does not know. */
const UNKNOWN_AGENT = 'Custom agent';

export function stepTitle(step: Step, names: CustomAgentNames = {}): string {
  return isCustomStep(step) ? (names[step] ?? UNKNOWN_AGENT) : STEP_TITLES[step];
}

/** A step read back as text (a run's step in a finding): its title, or the text when it names none. */
export function stepTextTitle(step: string, names: CustomAgentNames = {}): string {
  if (isCustomStep(step)) {
    return stepTitle(step, names);
  }
  return Object.entries(STEP_TITLES).find(([id]) => id === step)?.[1] ?? step;
}
