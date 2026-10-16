import {
  appendAgentLine,
  claimPrDescription,
  type Db,
  effortFor,
  finishPrDescription,
  getTicket,
  modelFor,
  type PrDescription,
  type PrDescriptionOutcome,
  type Project,
  recoverPrDescriptions,
  resolveAgent,
  schema,
  sharedPrompt,
  type Ticket,
  ticketBase,
  toolsFor,
  withoutUnionLinks,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runAgent, runResumable, type AgentFn } from './agent';
import type { TargetDeps } from './agent-review-target';
import type { GitHubApi } from './github/api';
import { IMPLEMENT_DENIED } from './implement-loop';
import { findTemplate, rewritePrompt, unfence } from './pr-description';
import { ensureTicketContainer, REPO_DIR } from './provision';
import type { RunSlots } from './slots';
import { ensureBranch } from './workspace-git';

export type PrDescriptionDeps = TargetDeps & {
  slots: RunSlots;
  apiFor: (project: Project) => GitHubApi | null;
  agent?: AgentFn;
};

function loadProject(db: Db, id: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw new Error(`Project ${id} not found`);
  }
  return project;
}

/** What GitHub says the description is now, and the API to read it with. */
function currentDescription(
  deps: PrDescriptionDeps,
  project: Project,
  prNumber: number,
): Promise<string> {
  const api = deps.apiFor(project);
  if (!api) {
    throw new Error('This project has no GitHub credentials');
  }
  return api.pullRequestBody({ owner: project.owner, repo: project.repo }, prNumber);
}

/** The agent's turn, in the ticket's container on its branch. */
async function runRewrite(
  deps: PrDescriptionDeps,
  run: { ticket: Ticket; project: Project; container: string; original: string },
  signal: AbortSignal,
): Promise<PrDescriptionOutcome> {
  const { db, runtime } = deps;
  const { ticket, project, container, original } = run;
  const log = (event: unknown): void => {
    appendAgentLine(db, { ticketId: ticket.id, payload: event });
  };
  const base = ticketBase(project, ticket);
  await ensureBranch(runtime, container, ticket.branch ?? '', base);
  const template = await findTemplate(runtime, container);
  log({ type: 'union_pr_description_rewrite', template: template?.path ?? null });
  const prompt = rewritePrompt({
    guidance: resolveAgent(db, 'pr_description').prompt,
    template,
    current: withoutUnionLinks(original),
    base,
    ticket,
  });
  const outcome = await runResumable(
    deps.agent ?? runAgent,
    runtime,
    {
      container,
      cwd: REPO_DIR,
      model: modelFor(db, 'pr_description'),
      effort: effortFor(db, 'pr_description'),
      prompt,
      tools: toolsFor(db, 'pr_description'),
      denied: IMPLEMENT_DENIED,
      resumeSessionId: ticket.sessionId,
      signal,
      onEvent: log,
    },
    `${sharedPrompt(db, project.id)}\n\n${prompt}`,
  );
  if (outcome.kind !== 'ok') {
    const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
    return { status: 'failed', error: `${prefix}${outcome.message}` };
  }
  const text = unfence(outcome.text);
  return text === ''
    ? { status: 'failed', error: 'The agent wrote no description' }
    : { status: 'ready', original, text };
}

/**
 * The implementer, resumed in the ticket's container (a fresh session if its own is gone), rewrites
 * the description GitHub has from the branch as it is now.
 */
async function rewrite(
  deps: PrDescriptionDeps,
  row: PrDescription,
  signal: AbortSignal,
): Promise<PrDescriptionOutcome> {
  const { db, runtime } = deps;
  const ticket = getTicket(db, row.ticketId);
  if (ticket.prNumber !== row.prNumber || !ticket.branch) {
    return { status: 'failed', error: 'The ticket is no longer on this pull request' };
  }
  if (ticket.phase.kind === 'running') {
    return { status: 'failed', error: 'A step started on the ticket: rewrite once it ends' };
  }
  const project = loadProject(db, ticket.projectId);
  const original = await currentDescription(deps, project, row.prNumber);
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  try {
    return await runRewrite(deps, { ticket, project, container: name, original }, signal);
  } finally {
    // A run the user started meanwhile works in the same container: it stops it itself.
    if (getTicket(db, ticket.id).phase.kind !== 'running') {
      await runtime.stop(name);
    }
  }
}

/**
 * Runs queued rewrites of pull request descriptions, sharing the run slots with the ticket pipeline,
 * the investigations and the agent reviews. Nothing reaches GitHub here: the user sends the draft.
 */
export class PrDescriptionRunner {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly deps: PrDescriptionDeps) {}

  recover(): void {
    recoverPrDescriptions(this.deps.db);
  }

  tick(): void {
    while (this.deps.slots.tryTake()) {
      const row = claimPrDescription(this.deps.db);
      if (!row) {
        this.deps.slots.release();
        return;
      }
      const abort = new AbortController();
      this.active.set(row.id, { abort, done: this.runTracked(row, abort.signal) });
    }
  }

  /** Stops a running rewrite; it then finishes as cancelled. */
  cancel(id: number): void {
    this.active.get(id)?.abort.abort();
  }

  stop(): void {
    for (const { abort } of this.active.values()) {
      abort.abort();
    }
  }

  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((run) => run.done));
  }

  private async runTracked(row: PrDescription, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await rewrite(this.deps, row, signal).catch(
        (error: unknown): PrDescriptionOutcome => ({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finishPrDescription(this.deps.db, row.id, signal.aborted ? { status: 'cancelled' } : outcome);
    } finally {
      this.active.delete(row.id);
      this.deps.slots.release();
    }
  }
}
