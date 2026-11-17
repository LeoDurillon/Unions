// The parts of the preview settings that core checks, their refusals answered as 400s. They are the
// agent's environment, the shared services' commands and the exposed services' paths.
import {
  parseAgentEnvironment,
  parsePreviewPaths,
  parseSharedCommands,
  previewPathProblems,
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

/** A service's paths on other services' hosts, kept only when it has some. */
export function servicePaths(value: unknown, service: string): Pick<PreviewService, 'paths'> {
  const paths = asBadRequest(() => parsePreviewPaths(value, service));
  return paths.length === 0 ? {} : { paths };
}

/** Refuses paths that point at no other exposed service, or that two services both claim. */
export function checkServicePaths(services: readonly PreviewService[]): void {
  const [problem] = previewPathProblems(services);
  if (problem !== undefined) {
    throw fail(BAD_REQUEST, problem);
  }
}
