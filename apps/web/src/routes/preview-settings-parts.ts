// The parts of the preview settings that core checks: the agent's environment, the shared services'
// commands. Their refusals are answered as 400s.
import {
  parseAgentEnvironment,
  parseSharedCommands,
  type PreviewConfig,
  type PreviewService,
} from '@union/core';

import { BAD_REQUEST, fail } from '../http';

function asBadRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw fail(BAD_REQUEST, error instanceof Error ? error.message : String(error));
  }
}

/** The variables the agent gets and the forwarding, stored only when not the default. */
export function agentEnvironment(
  input: Record<string, unknown>,
  names: string[],
): Pick<PreviewConfig, 'agentVariables' | 'forwardPorts' | 'startForImplementation'> {
  return asBadRequest(() => parseAgentEnvironment(input, names));
}

/** The shared services and their commands, stored only when set. */
export function sharedSettings(
  sharedServices: string[],
  commands: unknown,
  exposed: PreviewService[],
): Pick<PreviewConfig, 'sharedServices' | 'sharedCommands'> {
  const sharedCommands = asBadRequest(() => parseSharedCommands(commands, sharedServices, exposed));
  return {
    ...(sharedServices.length === 0 ? {} : { sharedServices }),
    ...(sharedCommands.length === 0 ? {} : { sharedCommands }),
  };
}
