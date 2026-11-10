// The commands that keep each preview's data apart on a shared service, as the settings send them,
// checked; and the ones a preview runs, its templates filled in.
import type { PreviewService, SharedServiceCommands } from '../schema/schema-types';
import { isRecord } from './preview-compose-check';
import { renderPreviewTemplate, templateProblems, type TemplateContext } from './preview-config';

const MAX_COMMAND_LENGTH = 4000;

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
): SharedServiceCommands {
  return {
    service,
    ...(create === undefined ? {} : { create }),
    ...(drop === undefined ? {} : { drop }),
  };
}

/**
 * The commands as sent: one entry per shared service at most, for a service that is shared, with
 * known templates; entries with no command are dropped. Throws with the reason.
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
    if (create !== undefined || drop !== undefined) {
      parsed.push(commandsOf(service, create, drop));
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
    .map(({ service, create, drop }) => commandsOf(service, filled(create), filled(drop)));
}
