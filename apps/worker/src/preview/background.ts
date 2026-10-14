import {
  emitEvent,
  getPreview,
  workspaceSubpaths,
  type ContainerRuntime,
  type ExecOptions,
  type PreviewConfig,
} from '@union/core';

import { compose, createMountFolders } from './compose';
import { fileToRun } from './compose-file';
import { joinPreview } from './network';
import { lastLines, loadTarget, projectDirectory, type PreviewDeps } from './target';
import { unionEnvFile } from './variables';

/** The services the agent works with, when the project has preview settings that name some. */
export function agentServices(preview: PreviewConfig | undefined): string[] {
  return preview?.agentServices ?? [];
}

/**
 * The same runtime, with `env` added to every command run in `container`: the agent, and the
 * install and check commands, get the project's plain variables (`DATABASE_URL`) for the step.
 */
export function withEnvironment(
  runtime: ContainerRuntime,
  container: string,
  env: Record<string, string>,
): ContainerRuntime {
  if (Object.keys(env).length === 0) {
    return runtime;
  }
  return new Proxy(runtime, {
    get(target, property, receiver): unknown {
      if (property !== 'exec') {
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (name: string, command: string[], options: ExecOptions = {}) =>
        target.exec(
          name,
          command,
          name === container ? { ...options, env: { ...env, ...options.env } } : options,
        );
    },
  });
}

/**
 * Starts the agent's services in the ticket's compose project (`up -d <services>`; compose adds
 * what they depend on) and puts the ticket's container on their network. Returns the plain
 * variables for the step's commands; never throws: a failure is logged, and the step runs without.
 */
export async function startAgentServices(
  deps: PreviewDeps,
  ticketId: number,
): Promise<Record<string, string>> {
  try {
    const target = loadTarget(deps, ticketId);
    const services = agentServices(target.config);
    if (services.length === 0) {
      return {};
    }
    const file = await fileToRun(deps, target);
    await createMountFolders(
      deps.runtime,
      deps.settings,
      target.workspaceVolume,
      workspaceSubpaths(file),
    );
    const output = await compose(deps.runtime, deps.settings, {
      args: [
        '-p',
        target.project,
        '--project-directory',
        projectDirectory(target),
        '-f',
        '-',
        'up',
        '-d',
        ...services,
      ],
      workspaceVolume: target.workspaceVolume,
      stdin: JSON.stringify(file),
      files: unionEnvFile(target),
    });
    if (output.exitCode !== 0) {
      throw new Error(lastLines(output.tail));
    }
    await joinPreview(deps.runtime, ticketId);
    emitEvent(deps.db, { type: 'agent_services_started', ticketId, payload: { services } });
    return target.plain;
  } catch (error) {
    emitEvent(deps.db, {
      type: 'agent_services_failed',
      ticketId,
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    return {};
  }
}

/**
 * After the step: the services stop (containers and data kept, memory freed), unless the preview
 * runs, which uses them.
 */
export async function pauseAgentServices(deps: PreviewDeps, ticketId: number): Promise<void> {
  if (getPreview(deps.db, ticketId)?.status === 'running') {
    return;
  }
  try {
    const target = loadTarget(deps, ticketId);
    const services = agentServices(target.config);
    if (services.length === 0) {
      return;
    }
    await compose(deps.runtime, deps.settings, { args: ['-p', target.project, 'stop'] });
    emitEvent(deps.db, { type: 'agent_services_stopped', ticketId, payload: { services } });
  } catch {
    // Nothing to stop.
  }
}
