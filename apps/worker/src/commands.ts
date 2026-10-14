import {
  cancelQueuedAgentReview,
  cancelQueuedGrouping,
  cancelQueuedInvestigation,
  cancelQueuedPrDescription,
  createTicket,
  decideRefusal,
  dispatch,
  getTicket,
  transition,
  emitEvent,
  recordValidation,
  schema,
  type Db,
} from '@union/core';
import { eq, isNull } from 'drizzle-orm';

type Command = typeof schema.commands.$inferSelect;

export type ContainerRef = { name: string; home: string; workspace: string };

/** Side effects some commands hand off (they are asynchronous; draining stays synchronous). */
export type CommandHooks = {
  removeContainers: (containers: ContainerRef[]) => void;
  /** Stops a running investigation. */
  cancelInvestigation: (id: number) => void;
  /** Stops a running agent review. */
  cancelAgentReview: (id: number) => void;
  /** Stops a running grouping of a review by spec. */
  cancelReviewGrouping: (id: number) => void;
  /** Posts a current review's drafts and summary on its pull request. */
  submitPullRequestReview: (reviewId: number, summary: string) => void;
  /** Stops a running rewrite of a PR description. */
  cancelPrDescription: (id: number) => void;
  /** Writes a rewritten PR description, as the user left it, to GitHub. */
  sendPrDescription: (id: number) => void;
  /** Starts, stops, reads the logs of, or generates the compose file of a ticket's preview. */
  preview: (ticketId: number, action: PreviewAction) => void;
};

export type PreviewAction = 'start' | 'stop' | 'logs' | 'generate' | 'e2e';

const PREVIEW_ACTIONS: Record<string, PreviewAction> = {
  preview_start: 'start',
  preview_stop: 'stop',
  preview_logs: 'logs',
  preview_generate: 'generate',
  preview_e2e: 'e2e',
};

function ignore(): void {
  // Without hooks (tests, tools), container removal and run cancellation are skipped.
}

const NO_HOOKS: CommandHooks = {
  removeContainers: ignore,
  cancelInvestigation: ignore,
  cancelAgentReview: ignore,
  cancelReviewGrouping: ignore,
  submitPullRequestReview: ignore,
  cancelPrDescription: ignore,
  sendPrDescription: ignore,
  preview: ignore,
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

/** For each cancel command: the id it carries, the cancel of a queued run, and the stop of a running one. */
const CANCELS: Record<
  string,
  {
    key: string;
    queued: (db: Db, id: number) => boolean;
    running: (hooks: CommandHooks, id: number) => void;
  }
> = {
  cancel_investigation: {
    key: 'investigationId',
    queued: cancelQueuedInvestigation,
    running: (hooks, id) => {
      hooks.cancelInvestigation(id);
    },
  },
  cancel_agent_review: {
    key: 'agentReviewId',
    queued: cancelQueuedAgentReview,
    running: (hooks, id) => {
      hooks.cancelAgentReview(id);
    },
  },
  cancel_review_grouping: {
    key: 'groupingId',
    queued: cancelQueuedGrouping,
    running: (hooks, id) => {
      hooks.cancelReviewGrouping(id);
    },
  },
  cancel_pr_description: {
    key: 'prDescriptionId',
    queued: cancelQueuedPrDescription,
    running: (hooks, id) => {
      hooks.cancelPrDescription(id);
    },
  },
};

/** A queued side run is cancelled here; a running one is stopped by its runner. */
function cancelRun(db: Db, command: Command, hooks: CommandHooks): void {
  const cancel = CANCELS[command.type];
  const id = field(command.payload, cancel?.key ?? '');
  if (!cancel || typeof id !== 'number') {
    throw new TypeError(`${command.type} needs a numeric "${cancel?.key ?? 'id'}"`);
  }
  if (!cancel.queued(db, id)) {
    cancel.running(hooks, id);
  }
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
  hooks.submitPullRequestReview(reviewId, typeof summary === 'string' ? summary : '');
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
  if (Object.hasOwn(CANCELS, command.type)) {
    cancelRun(db, command, hooks);
    return;
  }
  const preview = PREVIEW_ACTIONS[command.type];
  if (preview) {
    hooks.preview(requireTicketId(command), preview);
    return;
  }
  switch (command.type) {
    case 'create_ticket': {
      createFromCommand(db, command);
      return;
    }
    case 'start':
    case 'retry':
    case 'rebase':
    case 'cancel': {
      dispatch(db, requireTicketId(command), { type: command.type });
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
