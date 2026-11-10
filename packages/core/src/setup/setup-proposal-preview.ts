// Reads the preview part of the setup agent's answer: compose file, served services, plain variables, secrets' names.
import type { PreviewService, SharedServiceCommands } from '../schema/schema-types';
import { flag, names, records, section, text, type Dropped } from './setup-proposal-parts';
import type { SetupPreview, SetupSecret } from './setup-proposal-types';

/** The same names the Environments settings take. */
const SERVICE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const PREFIX = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/u;
const MAX_PORT = 65_535;
const MAX_ADDITIONS = 100_000;

function serviceOf(item: Record<string, unknown>, dropped: Dropped): PreviewService[] {
  const name = text(item.name);
  const { port } = item;
  const prefix = text(item.prefix);
  if (!SERVICE_NAME.test(name)) {
    dropped.push(`Service "${name}": not a valid name`);
    return [];
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    dropped.push(`Service "${name}": the port must be 1 to ${MAX_PORT}`);
    return [];
  }
  if (!PREFIX.test(prefix)) {
    dropped.push(`Service "${name}": the host prefix "${prefix}" is not a host name label`);
    return [];
  }
  return [{ name, port, prefix }];
}

function envOf(value: unknown, dropped: Dropped): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, raw] of Object.entries(section(value) ?? {})) {
    if (!VARIABLE_NAME.test(name) || typeof raw !== 'string') {
      dropped.push(`Variable "${name}": not a name with a text value`);
    } else {
      env[name] = raw;
    }
  }
  return env;
}

/** Commands for services the proposal shares; one for a service it does not share is dropped. */
function sharedCommandsOf(
  value: unknown,
  shared: readonly string[],
  dropped: Dropped,
): SharedServiceCommands[] {
  return records(value).flatMap((item) => {
    const service = text(item.service);
    const create = text(item.create);
    const drop = text(item.drop);
    if (!shared.includes(service)) {
      dropped.push(`Shared commands for "${service}": not one of the shared services`);
      return [];
    }
    if (create === '' && drop === '') {
      return [];
    }
    return [{ service, ...(create === '' ? {} : { create }), ...(drop === '' ? {} : { drop }) }];
  });
}

export function previewOf(value: unknown, dropped: Dropped): SetupPreview | null {
  const block = section(value);
  const composeFile = text(block?.composeFile);
  if (!block || composeFile === '') {
    return null;
  }
  const sharedServices = names(block.sharedServices, SERVICE_NAME, 'Shared service', dropped);
  return {
    composeFile,
    composeAdditions: text(block.composeAdditions, MAX_ADDITIONS),
    services: records(block.services).flatMap((item) => serviceOf(item, dropped)),
    env: envOf(block.env, dropped),
    agentServices: names(block.agentServices, SERVICE_NAME, 'Agent service', dropped),
    sharedServices,
    sharedCommands: sharedCommandsOf(block.sharedCommands, sharedServices, dropped),
    profiles: names(block.profiles, SERVICE_NAME, 'Profile', dropped),
    forwardPorts: flag(block.forwardPorts),
    startForImplementation: flag(block.startForImplementation),
    why: text(block.why),
  };
}

/** Names given together in one entry (`A / B`, `A, B`): each its own secret. */
const NAME_SEPARATORS = /[\s,/]+/u;

/** Names and where to get them; a value given with one is never read. */
export function secretsOf(value: unknown, dropped: Dropped): SetupSecret[] {
  return records(value).flatMap((item) => {
    const where = text(item.where);
    const given = text(item.name);
    if ('value' in item) {
      dropped.push(`Secret "${given}": its value was left out; enter it yourself`);
    }
    return given
      .split(NAME_SEPARATORS)
      .filter((name) => name !== '')
      .flatMap((name) => {
        if (!VARIABLE_NAME.test(name)) {
          dropped.push(`Secret "${name}": not a valid name`);
          return [];
        }
        return [{ name, where }];
      });
  });
}
