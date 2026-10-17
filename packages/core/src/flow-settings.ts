// A project's flow presets as the settings send them, checked: unique ids and names, valid steps, a default among them.
import { BUILT_IN_PRESETS, flowProblems, isPipelineStep, type FlowPreset } from './flows';
import type { ProjectConfig } from './schema-types';

export class FlowSettingsError extends Error {}

const MAX_PRESETS = 12;
const MAX_NAME_CHARS = 40;
const ID_PATTERN = /^[a-z0-9-]{1,40}$/u;

type FlowSettings = Pick<ProjectConfig, 'flows' | 'defaultFlow'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function presetOf(value: unknown): FlowPreset {
  if (!isRecord(value)) {
    throw new FlowSettingsError('Each flow needs an id, a name and its steps');
  }
  const { id, name, steps } = value;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new FlowSettingsError('A flow id is lowercase letters, digits and dashes');
  }
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '' || trimmed.length > MAX_NAME_CHARS) {
    throw new FlowSettingsError(`A flow name is 1 to ${MAX_NAME_CHARS} characters`);
  }
  const problems = flowProblems(steps);
  if (problems.length > 0 || !Array.isArray(steps)) {
    throw new FlowSettingsError(`${trimmed}: ${problems.join('; ')}`);
  }
  return { id, name: trimmed, steps: steps.filter((step) => isPipelineStep(step)) };
}

function presetsOf(value: unknown): FlowPreset[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PRESETS) {
    throw new FlowSettingsError(`"flows" is a list of 1 to ${MAX_PRESETS} flows`);
  }
  const presets = value.map((item: unknown) => presetOf(item));
  for (const key of ['id', 'name'] as const) {
    const seen = new Set(presets.map((preset) => preset[key].toLowerCase()));
    if (seen.size < presets.length) {
      throw new FlowSettingsError(`Two flows have the same ${key}`);
    }
  }
  return presets;
}

/**
 * The flows and default a settings change leaves: `flows` null goes back to the built-in presets, a
 * key left out keeps what is saved. A default no preset has any more is dropped (Full applies).
 */
export function flowSettingsChange(
  body: Record<string, unknown>,
  current: FlowSettings,
): FlowSettings {
  let { flows } = current;
  if ('flows' in body) {
    flows = body.flows === null ? undefined : presetsOf(body.flows);
  }
  const ids = new Set((flows ?? BUILT_IN_PRESETS).map((preset) => preset.id));
  if (!('defaultFlow' in body)) {
    const kept = current.defaultFlow;
    return { flows, defaultFlow: kept !== undefined && ids.has(kept) ? kept : undefined };
  }
  const { defaultFlow } = body;
  if (typeof defaultFlow !== 'string' || !ids.has(defaultFlow)) {
    throw new FlowSettingsError('"defaultFlow" must be the id of one of the flows');
  }
  return { flows, defaultFlow };
}
