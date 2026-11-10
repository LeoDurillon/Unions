// A shared service's own settings as they are sent, checked (the commands that keep each preview's
// data apart there, the port the proxy opens), and the commands a preview runs, its templates filled in.
import type { PreviewService, SharedServiceCommands } from '../schema/schema-types';
import { isRecord } from './preview-compose-check';
import { renderPreviewTemplate, templateProblems, type TemplateContext } from './preview-config';

const MAX_COMMAND_LENGTH = 4000;
const MAX_PORT = 65_535;

function commandOf(value: unknown, label: string, exposed: PreviewService[]): string | undefined {
  const command = typeof value === 'string' ? value.trim() : '';
  if (command === '') {
    return undefined;
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error(`${label}: at most ${MAX_COMMAND_LENGTH} characters`);
  }
  const [problem] = templateProblems(command, exposed);
  if (problem !== undefined) {
    throw new Error(`${label}: ${problem}`);
  }
  return command;
}

function commandsOf(
  service: string,
  create: string | undefined,
  drop: string | undefined,
  port?: number,
): SharedServiceCommands {
  return {
    service,
    ...(create === undefined ? {} : { create }),
    ...(drop === undefined ? {} : { drop }),
    ...(port === undefined ? {} : { port }),
  };
}

/** The port to open, when one is given. */
function portOf(value: unknown, service: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`${service}: give the port its web page answers on (1 to ${MAX_PORT})`);
  }
  return port;
}

/**
 * The settings as sent: one entry per shared service at most, for a service that is shared, with
 * known templates and a real port; entries with nothing set are dropped. Throws with the reason.
 */
export function parseSharedCommands(
  value: unknown,
  shared: readonly string[],
  exposed: PreviewService[],
): SharedServiceCommands[] {
  const items: unknown[] = Array.isArray(value) ? value : [];
  const parsed: SharedServiceCommands[] = [];
  for (const item of items) {
    const entry = isRecord(item) ? item : {};
    const service = typeof entry.service === 'string' ? entry.service.trim() : '';
    if (!shared.includes(service)) {
      throw new Error(`"${service}" is not a shared service: its commands cannot run`);
    }
    if (parsed.some((other) => other.service === service)) {
      throw new Error(`${service}: its commands are given twice`);
    }
    const create = commandOf(entry.create, `${service}, at a preview's start`, exposed);
    const drop = commandOf(entry.drop, `${service}, when a preview's data goes`, exposed);
    const port = portOf(entry.port, service);
    if (create !== undefined || drop !== undefined || port !== undefined) {
      parsed.push(commandsOf(service, create, drop, port));
    }
  }
  return parsed;
}

/** The commands one preview runs, for the services it shares, with its templates filled in. */
export function renderSharedCommands(
  commands: readonly SharedServiceCommands[],
  shared: readonly string[],
  context: TemplateContext,
): SharedServiceCommands[] {
  const filled = (command: string | undefined): string | undefined =>
    command === undefined ? undefined : renderPreviewTemplate(command, context);
  return commands
    .filter(({ service }) => shared.includes(service))
    .map(({ service, create, drop, port }) =>
      commandsOf(service, filled(create), filled(drop), port),
    );
}
