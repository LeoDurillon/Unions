// Runs a `ticket` investigation in the ticket's own container, on the workspace as the agent left
// it.
import {
  appendAgentLine,
  emitEvent,
  getTicket,
  type Investigation,
  type InvestigationOutcome,
  parentOf,
  type Project,
  type Ticket,
  ticketBase,
} from '@union/core';

import { runAgent, type AgentFn, type AgentOutcome } from './agent';
import { runIn } from './container-exec';
import type { InvestigationDeps } from './investigate';
import { parentSection } from './prompts';
import { ensureTicketContainer, REPO_DIR } from './provision';

/**
 * Never allowed on a ticket's workspace, whatever tools the investigation has: it reads the branch
 * the agent will push, it does not change it. Bash commands that write some other way (`sed -i`,
 * redirections) cannot all be listed: the workspace is compared before and after the run instead.
 */
export const TICKET_INVESTIGATION_DENIED = [
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  ...[
    'add',
    'commit',
    'checkout',
    'switch',
    'restore',
    'reset',
    'stash',
    'rebase',
    'merge',
    'cherry-pick',
    'revert',
    'clean',
    'rm',
    'mv',
    'tag',
    'branch -d',
    'branch -D',
    'worktree',
  ].map((command) => `Bash(git ${command}*)`),
  'Bash(rm *)',
  'Bash(mv *)',
] as const;

/** Where the agent stands, for the prompt: the ticket's branch in its own workspace. */
function ticketWhere(
  ticket: { title: string; body: string; branch: string | null },
  base: string,
  /** The "Builds on" section of a ticket with a parent, as its steps get it; empty without one. */
  buildsOn = '',
): string {
  const branch = ticket.branch
    ? `on the ticket's branch \`${ticket.branch}\` as its agent left it (uncommitted work included). Compare it with its base with \`git diff ${base}...HEAD\` and \`git status\``
    : `on \`${base}\`: the ticket has no branch yet`;
  return `The repository is checked out at ${REPO_DIR}, in the workspace of this ticket, ${branch}. Read the code, run read-only commands, query the services it runs if any; do not change any file: the workspace belongs to the ticket, and its agent works on it next.

The ticket:

# ${ticket.title}

${ticket.body}${buildsOn === '' ? '' : `\n\n${buildsOn}`}`;
}

/** HEAD and the status of the work tree: what an investigation must leave as it found it. */
async function workspaceState(deps: InvestigationDeps, container: string): Promise<string> {
  const head = await runIn(deps.runtime, container, ['git', '-C', REPO_DIR, 'rev-parse', 'HEAD']);
  const status = await runIn(deps.runtime, container, [
    'git',
    '-C',
    REPO_DIR,
    'status',
    '--porcelain',
  ]);
  return `${head.stdout.trim()}\n${status.stdout.trim()}`;
}

function toOutcome(outcome: AgentOutcome, cancelled: boolean): InvestigationOutcome {
  if (cancelled) {
    return { status: 'cancelled' };
  }
  if (outcome.kind === 'ok') {
    return { status: 'succeeded', result: outcome.text };
  }
  const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
  return { status: 'failed', error: `${prefix}${outcome.message}` };
}

/** Where the agent stands, with the ticket's parent (heading one level down, under the ticket). */
function whereOnTicket(deps: InvestigationDeps, ticket: Ticket, project: Project): string {
  const parent = parentOf(deps.db, ticket);
  const base = project.config.baseBranch;
  return ticketWhere(
    ticket,
    ticketBase(project, ticket),
    parent ? `#${parentSection(parent, ticket, base)}` : '',
  );
}

const CHANGED_WARNING =
  "\n\n---\n⚠ The ticket's workspace changed during this investigation (its commit or its uncommitted files): check it before the ticket's next step.";

/**
 * Runs a `ticket` investigation in the ticket's own container, as the agent left the workspace.
 * Refused while the ticket runs a step; the container is stopped after, unless a step started.
 */
export async function runOnTicket(
  deps: InvestigationDeps & { agent?: AgentFn },
  run: {
    investigation: Investigation;
    project: Project;
    /** The whole prompt, given where the agent stands. */
    prompt: (where: string) => string;
    signal: AbortSignal;
  },
): Promise<InvestigationOutcome> {
  const { db, runtime, config } = deps;
  const { investigation, project, prompt, signal } = run;
  if (investigation.onTicketId === null) {
    return { status: 'failed', error: 'The ticket this investigation ran on was removed' };
  }
  const ticket = getTicket(db, investigation.onTicketId);
  if (ticket.phase.kind === 'running') {
    return {
      status: 'failed',
      error:
        'The ticket started a step: ask again once it is done (the agent works in that workspace)',
    };
  }
  const { name } = await ensureTicketContainer(db, runtime, config, ticket);
  try {
    const before = await workspaceState(deps, name);
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: name,
      cwd: REPO_DIR,
      model: investigation.model,
      prompt: prompt(whereOnTicket(deps, ticket, project)),
      tools: investigation.tools,
      denied: TICKET_INVESTIGATION_DENIED,
      signal,
      onEvent: (event) => {
        appendAgentLine(db, { investigationId: investigation.id, payload: event });
      },
    });
    const result = toOutcome(outcome, signal.aborted);
    const changed = (await workspaceState(deps, name)) !== before;
    if (changed) {
      emitEvent(db, {
        type: 'investigation_changed_workspace',
        investigationId: investigation.id,
        ticketId: ticket.id,
        payload: { ticketId: ticket.id },
      });
    }
    return changed && result.status === 'succeeded'
      ? { ...result, result: `${result.result}${CHANGED_WARNING}` }
      : result;
  } finally {
    // A step the user started meanwhile works in the same container: it stops it itself.
    if (getTicket(db, ticket.id).phase.kind !== 'running') {
      await runtime.stop(name);
    }
  }
}
