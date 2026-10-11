import { createTicket, dispatch, emitEvent, recordValidation, schema, type Db } from '@union/core';
import { eq, isNull } from 'drizzle-orm';

type Command = typeof schema.commands.$inferSelect;

export type ContainerRef = { name: string; home: string; workspace: string };

/** Side effects some commands hand off (they are asynchronous; draining stays synchronous). */
export type CommandHooks = {
  removeContainers: (containers: ContainerRef[]) => void;
};

function ignoreContainers(): void {
  // Without hooks (tests, tools), container removal is simply skipped.
}

const NO_HOOKS: CommandHooks = { removeContainers: ignoreContainers };

function isContainerRef(value: unknown): value is ContainerRef {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.home === 'string' &&
    typeof value.workspace === 'string'
  );
}

function containersOf(payload: unknown): ContainerRef[] {
  const list = field(payload, 'containers');
  return Array.isArray(list) ? list.filter((item) => isContainerRef(item)) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function field(payload: unknown, key: string): unknown {
  return isRecord(payload) ? payload[key] : undefined;
}

function requireString(payload: unknown, key: string): string {
  const value = field(payload, key);
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Command payload needs a non-empty string "${key}"`);
  }
  return value;
}

function requireTicketId(command: Command): number {
  if (command.ticketId === null) {
    throw new Error(`Command ${command.type} needs a ticketId`);
  }
  return command.ticketId;
}

function execute(db: Db, command: Command, hooks: CommandHooks): void {
  switch (command.type) {
    case 'create_ticket': {
      const projectId = field(command.payload, 'projectId');
      if (typeof projectId !== 'number') {
        throw new TypeError('create_ticket needs a numeric "projectId"');
      }
      const body = field(command.payload, 'body');
      createTicket(db, {
        projectId,
        title: requireString(command.payload, 'title'),
        body: typeof body === 'string' ? body : '',
      });
      return;
    }
    case 'start':
    case 'retry':
    case 'cancel': {
      dispatch(db, requireTicketId(command), { type: command.type });
      return;
    }
    case 'approve': {
      const ticketId = requireTicketId(command);
      recordValidation(db, ticketId, { status: 'approved' });
      dispatch(db, ticketId, { type: 'approve' });
      return;
    }
    case 'revise': {
      const ticketId = requireTicketId(command);
      recordValidation(db, ticketId, {
        status: 'revise',
        feedback: requireString(command.payload, 'feedback'),
      });
      dispatch(db, ticketId, { type: 'revise' });
      return;
    }
    case 'remove_containers': {
      hooks.removeContainers(containersOf(command.payload));
      return;
    }
    default: {
      throw new Error(`Unknown command type "${command.type}"`);
    }
  }
}

/** Returns the failure message, or null when the command succeeded. */
function tryExecute(db: Db, command: Command, hooks: CommandHooks): string | null {
  try {
    execute(db, command, hooks);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(db, {
      type: 'command_failed',
      ticketId: command.ticketId ?? undefined,
      payload: { id: command.id, type: command.type, error: message },
    });
    return message;
  }
}

/** Handles every pending command once. A failing command is marked handled with its error. */
export function drainCommands(db: Db, hooks: CommandHooks = NO_HOOKS): number {
  const pending = db.select().from(schema.commands).where(isNull(schema.commands.handledAt)).all();
  for (const command of pending) {
    const error = tryExecute(db, command, hooks);
    db.update(schema.commands)
      .set({ handledAt: Date.now(), error })
      .where(eq(schema.commands.id, command.id))
      .run();
  }
  return pending.length;
}
