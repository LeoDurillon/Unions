// The project's saved scripts: checked as the settings store them, and the run each one queues.
import { ContainerRunError, MAX_COMMAND_CHARS, MAX_RUN_TIMEOUT_SEC } from './container-runs';
import type { ProjectConfig, ProjectScript } from './schema-types';

/** Saved scripts the settings refuse: not a list, a name taken twice, a command too long. */
export class ScriptsError extends Error {}

const MAX_SCRIPTS = 30;
const MAX_NAME_CHARS = 60;

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new ScriptsError(`Each script needs ${what}`);
  }
  return value.trim();
}

function timeoutOf(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_RUN_TIMEOUT_SEC
  ) {
    throw new ScriptsError(`"${name}": the timeout must be 1 to ${MAX_RUN_TIMEOUT_SEC} seconds`);
  }
  return value;
}

function scriptOf(value: unknown): ProjectScript {
  if (typeof value !== 'object' || value === null) {
    throw new ScriptsError('Each script must be an object with a name and a command');
  }
  const item: Record<string, unknown> = { ...value };
  const name = text(item.name, 'a name');
  if (name === '' || name.length > MAX_NAME_CHARS) {
    throw new ScriptsError(`A script name must have 1 to ${MAX_NAME_CHARS} characters`);
  }
  const command = text(item.command, 'a command');
  if (command === '' || command.length > MAX_COMMAND_CHARS) {
    throw new ScriptsError(`"${name}": the command must have 1 to ${MAX_COMMAND_CHARS} characters`);
  }
  const timeoutSec = timeoutOf(item.timeoutSec, name);
  return timeoutSec === undefined ? { name, command } : { name, command, timeoutSec };
}

/** The saved scripts as the settings store them, checked: names trimmed and unique. */
export function parseScripts(value: unknown): ProjectScript[] {
  if (!Array.isArray(value)) {
    throw new ScriptsError('"scripts" must be a list');
  }
  if (value.length > MAX_SCRIPTS) {
    throw new ScriptsError(`At most ${MAX_SCRIPTS} scripts`);
  }
  const scripts = value.map((item: unknown) => scriptOf(item));
  const names = new Set<string>();
  for (const { name } of scripts) {
    const key = name.toLowerCase();
    if (names.has(key)) {
      throw new ScriptsError(`Two scripts are named "${name}"`);
    }
    names.add(key);
  }
  return scripts;
}

/** What a run of the saved script named `name` queues. */
export function scriptRun(
  config: ProjectConfig,
  name: string,
): { command: string; timeoutSec?: number; scriptName: string } {
  const script = (config.scripts ?? []).find((item) => item.name === name);
  if (!script) {
    throw new ContainerRunError(`No saved script is named "${name}"`);
  }
  return { command: script.command, timeoutSec: script.timeoutSec, scriptName: script.name };
}
