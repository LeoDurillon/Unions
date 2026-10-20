import {
  createTicket,
  decideRefusal,
  dispatch,
  getTicket,
  isReviewVerdict,
  transition,
  emitEvent,
  recordValidation,
  schema,
  type Db,
  type WorkspaceOwner,
} from '@union/core';
import { eq, isNull } from 'drizzle-orm';

import { cancelRun, isCancelCommand } from './command-cancels';
import {
  NO_HOOKS,
  type CommandHooks,
  type ContainerRef,
  type PreviewAction,
} from './command-hooks';
import { ciJobOf } from './github/ci-rerun';
import { ticketEditOf } from './github/ticket-edit';

export type { CommandHooks, ContainerRef, PreviewAction } from './command-hooks';

type Command = typeof schema.commands.$inferSelect;

const PREVIEW_ACTIONS: Record<string, PreviewAction> = {
  preview_start: 'start',
  preview_stop: 'stop',
  preview_logs: 'logs',
  preview_generate: 'generate',
  preview_e2e: 'e2e',
  review_checkout_update: 'update',
};

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

/** A ticket's preview command carries its ticket; a pull request's, `{ reviewId }` in its payload. */
function previewOwnerOf(command: Command): WorkspaceOwner {
  if (command.ticketId !== null) {
    return { ticketId: command.ticketId };
  }
  const reviewId = field(command.payload, 'reviewId');
  if (typeof reviewId !== 'number') {
    throw new TypeError(`${command.type} needs a ticketId or a numeric "reviewId"`);
  }
  return { reviewId };
}

function numberField(command: Command, key: string): number {
  const value = field(command.payload, key);
  if (typeof value !== 'number') {
    throw new TypeError(`${command.type} needs a numeric "${key}"`);
  }
  return value;
}

function createFromCommand(db: Db, command: Command): void {
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
}

/** The review is posted by the worker, outside the drain (it calls GitHub). */
function submitReview(command: Command, hooks: CommandHooks): void {
  const reviewId = field(command.payload, 'reviewId');
  const summary = field(command.payload, 'summary');
  if (typeof reviewId !== 'number') {
    throw new TypeError('submit_pr_review needs a numeric "reviewId"');
  }
  const verdict = field(command.payload, 'verdict');
  hooks.submitPullRequestReview(reviewId, {
    summary: typeof summary === 'string' ? summary : '',
    // Commands queued before verdicts existed carry none: they were comments.
    verdict: isReviewVerdict(verdict) ? verdict : 'comment',
  });
}

/**
 * The user's decision on changes a hook refused to commit: recorded for the run that applies it.
 * Checked against the phase first, so a refused transition records nothing.
 */
function decideOnRefusedCommit(db: Db, command: Command): void {
  const ticketId = requireTicketId(command);
  const type = command.type === 'commit_anyway' ? 'commit_anyway' : 'drop_leftovers';
  transition(getTicket(db, ticketId).phase, { type });
  decideRefusal(
    db,
    ticketId,
    type === 'commit_anyway'
      ? { resolution: 'commit', message: requireString(command.payload, 'message') }
      : { resolution: 'discard' },
  );
  dispatch(db, ticketId, { type });
}

/** Feedback on the latest output; on a refused commit, it also closes the refusal. */
function revise(db: Db, command: Command): void {
  const ticketId = requireTicketId(command);
  const refused = getTicket(db, ticketId).phase.kind === 'commit_refused';
  recordValidation(db, ticketId, {
    status: 'revise',
    feedback: requireString(command.payload, 'feedback'),
  });
  if (refused) {
    decideRefusal(db, ticketId, { resolution: 'revise' });
  }
  dispatch(db, ticketId, { type: 'revise' });
}

/** Commands that are a state-machine action as they are, with no payload. */
const PLAIN_ACTIONS = [
  'start',
  'retry',
  'rebase',
  'simplify',
  'split',
  'drop_split',
  'cancel',
] as const;

function isPlainAction(type: string): type is (typeof PLAIN_ACTIONS)[number] {
  return PLAIN_ACTIONS.some((action) => action === type);
}

/** The user's answer to an output, or to a refused commit. */
const DECISIONS = new Set(['approve', 'revise', 'commit_anyway', 'drop_leftovers']);

function decide(db: Db, command: Command): void {
  if (command.type === 'approve') {
    const ticketId = requireTicketId(command);
    recordValidation(db, ticketId, { status: 'approved' });
    dispatch(db, ticketId, { type: 'approve' });
  } else if (command.type === 'revise') {
    revise(db, command);
  } else {
    decideOnRefusedCommit(db, command);
  }
}

function execute(db: Db, command: Command, hooks: CommandHooks): void {
  if (DECISIONS.has(command.type)) {
    decide(db, command);
    return;
  }
  if (isPlainAction(command.type)) {
    dispatch(db, requireTicketId(command), { type: command.type });
    return;
  }
  if (isCancelCommand(command.type)) {
    cancelRun(db, command, hooks);
    return;
  }
  const preview = PREVIEW_ACTIONS[command.type];
  if (preview) {
    hooks.preview(previewOwnerOf(command), preview);
    return;
  }
  switch (command.type) {
    case 'create_ticket': {
      createFromCommand(db, command);
      return;
    }
    case 'submit_pr_review': {
      submitReview(command, hooks);
      return;
    }
    case 'update_pr_description': {
      hooks.sendPrDescription(numberField(command, 'prDescriptionId'));
      return;
    }
    case 'edit_ticket': {
      hooks.editTicket(requireTicketId(command), ticketEditOf(command.payload));
      return;
    }
    case 'rerun_ci_job': {
      hooks.rerunCiJob(requireTicketId(command), ciJobOf(command.payload));
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
