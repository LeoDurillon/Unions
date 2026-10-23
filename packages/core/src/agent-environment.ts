// The agent's environment settings as sent (`agentVariables`, `forwardPorts`,
// `startForImplementation`), checked; only what differs from the defaults is kept.
import { isRecord } from './preview-compose-check';
import type { AgentVariables } from './schema-types';

/**
 * Where the preview's file keeps the ports a service publishes on the machine: Union drops `ports`
 * (previews publish nothing), and forwards these to the agent's `localhost` instead. Compose ignores
 * `x-` fields.
 */
export const PUBLISHED_PORTS_KEY = 'x-union-ports';

/** `localhost:<port>` in the ticket's container goes to `<service>:<targetPort>`. */
export type PortForward = { service: string; port: number; targetPort: number };

/**
 * The agent's services for a run in the ticket's container: their names, the ports forwarded to
 * its `localhost` and the ones that could not be, the variable names its commands get, and how to
 * bring the forwarder back if something killed it (before the checks).
 */
export type AgentSetup = {
  services: string[];
  forwards: PortForward[];
  skipped: string[];
  variables: string[];
  ensure: () => Promise<void>;
};

const MAX_PORT = 65_535;

function portOf(value: unknown): number | null {
  const port = typeof value === 'string' ? Number(value) : value;
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= MAX_PORT
    ? port
    : null;
}

/** `"9000-9001"`: each port of a range; one port alone otherwise; empty when unreadable. */
function portRange(value: unknown): number[] {
  if (typeof value === 'string' && value.includes('-')) {
    const [from, to] = value.split('-').map((part) => portOf(part));
    return from && to && to >= from
      ? Array.from({ length: to - from + 1 }, (_, at) => from + at)
      : [];
  }
  const port = portOf(value);
  return port === null ? [] : [port];
}

/**
 * One published entry as `config --format json` prints it (`{ target, published, protocol }`):
 * TCP only; no `published` (a random port on the machine) forwards the target's own number.
 */
function entryForwards(service: string, entry: unknown): PortForward[] {
  if (!isRecord(entry) || (entry.protocol !== undefined && entry.protocol !== 'tcp')) {
    return [];
  }
  const targets = portRange(entry.target);
  const published =
    entry.published === undefined || entry.published === '' ? targets : portRange(entry.published);
  if (targets.length === 0 || published.length !== targets.length) {
    return [];
  }
  return targets.map((targetPort, at) => ({
    service,
    port: published[at] ?? targetPort,
    targetPort,
  }));
}

function servicePorts(service: unknown): unknown[] {
  if (!isRecord(service)) {
    return [];
  }
  const ports = service[PUBLISHED_PORTS_KEY] ?? service.ports;
  return Array.isArray(ports) ? ports : [];
}

/**
 * The agent services' published ports, to forward to the agent's `localhost`; a port two services
 * publish goes to the first, the other is reported.
 */
export function agentForwards(
  file: unknown,
  services: readonly string[],
): { forwards: PortForward[]; problems: string[] } {
  const all = isRecord(file) && isRecord(file.services) ? file.services : {};
  const forwards: PortForward[] = [];
  const problems: string[] = [];
  for (const service of services) {
    for (const forward of servicePorts(all[service]).flatMap((entry) =>
      entryForwards(service, entry),
    )) {
      const taken = forwards.find((other) => other.port === forward.port);
      if (taken) {
        problems.push(`Port ${forward.port} of ${service} is already ${taken.service}'s`);
      } else {
        forwards.push(forward);
      }
    }
  }
  return { forwards, problems };
}

/** The plain variables the agent's commands get, by the setting (all when unset). */
export function agentVariables(
  plain: Record<string, string>,
  setting?: AgentVariables,
): Record<string, string> {
  if (!setting || setting.mode === 'all') {
    return plain;
  }
  const names = new Set(setting.mode === 'chosen' ? (setting.names ?? []) : []);
  return Object.fromEntries(Object.entries(plain).filter(([name]) => names.has(name)));
}

/**
 * The setting as the settings page sends it, checked against the project's plain variables;
 * undefined for the default (all). Throws with the reason.
 */
export function parseAgentVariables(
  value: unknown,
  plainNames: readonly string[],
): AgentVariables | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value) || !['all', 'none', 'chosen'].includes(String(value.mode))) {
    throw new Error('"agentVariables.mode" must be all, none or chosen');
  }
  if (value.mode === 'all') {
    return undefined;
  }
  if (value.mode === 'none') {
    return { mode: 'none' };
  }
  const list: unknown[] = Array.isArray(value.names) ? value.names : [];
  const names = list.map((name) => (typeof name === 'string' ? name : ''));
  const unknown = names.find((name) => !plainNames.includes(name));
  if (unknown !== undefined) {
    throw new Error(`"${unknown}" is not one of the preview's plain variables`);
  }
  return { mode: 'chosen', names: [...new Set(names)] };
}

function optionalSwitch(input: Record<string, unknown>, name: string): boolean | undefined {
  const value = input[name];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new TypeError(`"${name}" must be true or false`);
  }
  return value;
}

/**
 * The agent's environment settings as sent (`agentVariables`, `forwardPorts`,
 * `startForImplementation`), checked; only what differs from the defaults is kept. Throws with the
 * reason.
 */
export function parseAgentEnvironment(
  input: Record<string, unknown>,
  plainNames: readonly string[],
): { agentVariables?: AgentVariables; forwardPorts?: false; startForImplementation?: true } {
  const forwardPorts = optionalSwitch(input, 'forwardPorts');
  const startForImplementation = optionalSwitch(input, 'startForImplementation');
  const variables = parseAgentVariables(input.agentVariables, plainNames);
  return {
    ...(variables ? { agentVariables: variables } : {}),
    ...(forwardPorts === false ? { forwardPorts: false as const } : {}),
    ...(startForImplementation === true ? { startForImplementation: true as const } : {}),
  };
}
