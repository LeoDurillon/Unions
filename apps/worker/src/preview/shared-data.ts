// What keeps each preview's data apart on the shared services (its database, its bucket). Commands
// run in their containers at each start of the preview, and when its data is removed.
import { sharedNetwork, sharedPart, type ComposeJson, type WorkspaceOwner } from '@union/core';

import { killedNote, runIn } from '../container-exec';
import { outputLog } from './output-log';
import { loadTarget, type PreviewDeps, type Target } from './target';

/** A restore or a copy of a database takes a while; past this, the command is stopped. */
const COMMAND_TIMEOUT_MS = 600_000;
/** The lines of a failed command's output its reason quotes. */
const REASON_LINES = 20;

type Owned = Pick<Target, 'owner' | 'projectId' | 'sharedCommands'>;

/** The shared service's container; null when it does not run. */
async function containerOf(
  deps: PreviewDeps,
  projectId: number,
  service: string,
): Promise<string | null> {
  const [container] = await deps.runtime.serviceContainers(sharedNetwork(projectId), service);
  return container ?? null;
}

/** Runs one command in the service's container, its output in the ticket's log; why it failed, or null. */
async function runCommand(
  deps: PreviewDeps,
  target: Owned,
  service: string,
  command: string,
): Promise<string | null> {
  const container = await containerOf(deps, target.projectId, service);
  if (container === null) {
    return `${service} is not running`;
  }
  const result = await runIn(deps.runtime, container, ['sh', '-c', command], {
    signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
  });
  const log = outputLog(deps.db, target.owner);
  const lines = [...result.stdout.split('\n'), ...result.stderr.split('\n')].filter(
    (line) => line.trim() !== '',
  );
  for (const line of lines) {
    log.push(`${service} | ${line}`);
  }
  log.flush();
  if (result.exitCode === 0) {
    return null;
  }
  const output = lines.slice(-REASON_LINES).join('\n');
  return `exit ${result.exitCode}${killedNote(result.exitCode)}\n${output}`;
}

/**
 * Once the shared services run and before the preview's own start: each one's `create` command for
 * this preview (its database, its bucket). Throws when one fails: the preview would start without
 * its data.
 */
export async function createSharedData(
  deps: PreviewDeps,
  target: Owned,
  file: ComposeJson,
): Promise<void> {
  const running = Object.keys(sharedPart(file)?.services ?? {});
  const creates = target.sharedCommands.flatMap(({ service, create }) =>
    create !== undefined && running.includes(service) ? [{ service, create }] : [],
  );
  for (const { service, create } of creates) {
    const problem = await runCommand(deps, target, service, create);
    if (problem !== null) {
      throw new Error(`The preview's data in ${service} could not be made (${problem})`);
    }
  }
}

/** The preview's target; null when it has none (no settings, no workspace): no data to drop then. */
function targetOf(deps: PreviewDeps, owner: WorkspaceOwner): Target | null {
  try {
    return loadTarget(deps, owner);
  } catch {
    return null;
  }
}

/**
 * Before the preview's data goes (Stop, Reset, removal): each shared service's `drop` command for
 * it. Best effort: a service that does not run keeps it, and a failure is only logged.
 */
export async function dropSharedData(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  const target = targetOf(deps, owner);
  for (const { service, drop } of target?.sharedCommands ?? []) {
    const problem =
      target === null || drop === undefined ? null : await runCommand(deps, target, service, drop);
    if (problem !== null) {
      const log = outputLog(deps.db, owner);
      log.push(`${service} | the preview's data there stays: ${problem}`);
      log.flush();
    }
  }
}
