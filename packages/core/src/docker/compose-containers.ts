// Reads `docker ps` lines of a compose project's containers, and which of its exposed services stopped.
import type { ProjectContainer } from './runtime';

/** One line per container: its service, its state, its status ("Exited (1) 2 minutes ago"). */
export const CONTAINER_FORMAT = '{{.Label "com.docker.compose.service"}}\t{{.State}}\t{{.Status}}';

const EXIT_CODE = /^Exited \((?<code>-?\d+)\)/u;
/** States in which the service still counts as up: a restart policy brings it back. */
const UP_STATES = new Set(['running', 'restarting']);

export function parseProjectContainers(listed: string): ProjectContainer[] {
  return listed
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [service = '', state = '', status = ''] = line.split('\t');
      const code = EXIT_CODE.exec(status)?.groups?.code;
      return {
        service,
        running: UP_STATES.has(state),
        exitCode: code === undefined ? null : Number(code),
      };
    });
}

/**
 * The exposed services with no container up: exited, killed, or gone. A service with several
 * containers (replicas) is down when none is up.
 */
export function stoppedServices(
  exposed: readonly string[],
  containers: readonly ProjectContainer[],
): { service: string; exitCode: number | null }[] {
  return exposed
    .filter((service) => !containers.some((c) => c.service === service && c.running))
    .map((service) => ({
      service,
      exitCode: containers.find((c) => c.service === service)?.exitCode ?? null,
    }));
}
