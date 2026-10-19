// The flow presets part of a project settings change, refused with a 400 when they do not hold.
import {
  flowReadySteps,
  flowSettingsChange,
  FlowSettingsError,
  type Db,
  type ProjectConfig,
} from '@union/core';

import { BAD_REQUEST, fail } from '../http';

export const FLOW_FIELDS = ['flows', 'defaultFlow'] as const;

export function flowsChange(
  db: Db,
  body: Record<string, unknown>,
  config: ProjectConfig,
): Pick<ProjectConfig, 'flows' | 'defaultFlow'> {
  try {
    return flowSettingsChange(body, config, flowReadySteps(db));
  } catch (error) {
    throw error instanceof FlowSettingsError ? fail(BAD_REQUEST, error.message) : error;
  }
}
