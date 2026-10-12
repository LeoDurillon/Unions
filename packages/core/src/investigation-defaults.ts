import type { AgentModel } from './states';

/** What a new investigation runs with until the user picks otherwise. Browser-safe. */
export const INVESTIGATION_DEFAULTS: { model: AgentModel; tools: readonly string[] } = {
  model: 'opus',
  tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
};
