// The flow presets part of a project settings change, refused with a 400 when they do not hold.
import { flowSettingsChange, FlowSettingsError, type ProjectConfig } from '@union/core';

import { BAD_REQUEST, fail } from '../http';

export const FLOW_FIELDS = ['flows', 'defaultFlow'] as const;

export function flowsChange(
  body: Record<string, unknown>,
  config: ProjectConfig,
): Pick<ProjectConfig, 'flows' | 'defaultFlow'> {
  try {
    return flowSettingsChange(body, config);
  } catch (error) {
    throw error instanceof FlowSettingsError ? fail(BAD_REQUEST, error.message) : error;
  }
}
