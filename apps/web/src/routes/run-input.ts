// A command run as the user asks for it, for a ticket's workspace or a pull request's: the body read, checked and queued.
import {
  ContainerRunError,
  queueContainerRun,
  scriptRun,
  type ContainerRun,
  type Db,
  type ProjectConfig,
  type WorkspaceOwner,
} from '@union/core';

import { BAD_REQUEST, CONFLICT, fail } from '../http';

/** The rules' refusals are the user's to resolve: they answer 409 with the reason. */
export function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw error instanceof ContainerRunError ? fail(CONFLICT, error.message) : error;
  }
}

function timeoutOf(body: Record<string, unknown>): number | undefined {
  const { timeoutSec } = body;
  if (timeoutSec === undefined || timeoutSec === null) {
    return undefined;
  }
  if (typeof timeoutSec !== 'number') {
    throw fail(BAD_REQUEST, '"timeoutSec" must be a number of seconds');
  }
  return timeoutSec;
}

/** `{ command, timeoutSec? }`, or `{ scriptName }`: a saved script, with its own timeout. */
export function queueFromBody(
  db: Db,
  owner: WorkspaceOwner,
  config: ProjectConfig,
  body: Record<string, unknown>,
): ContainerRun {
  if (typeof body.scriptName === 'string') {
    const name = body.scriptName;
    return checked(() => queueContainerRun(db, { owner, ...scriptRun(config, name) }));
  }
  if (typeof body.command !== 'string') {
    throw fail(BAD_REQUEST, '"command" or "scriptName" must be a string');
  }
  const input = { owner, command: body.command, timeoutSec: timeoutOf(body) };
  return checked(() => queueContainerRun(db, input));
}
