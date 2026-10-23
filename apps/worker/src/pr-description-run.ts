// Rewrites a pull request description in the ticket's container, from the template and the change.
import {
  appendAgentLine,
  type Db,
  effortFor,
  getTicket,
  modelFor,
  type PrDescription,
  type PrDescriptionOutcome,
  type Project,
  resolveAgent,
  sharedPrompt,
  type Ticket,
  ticketBase,
  toolsFor,
  withoutUnionLinks,
} from '@union/core';

import { runAgent, runResumable, type AgentFn } from './agent';
import { loadProject, type TargetDeps } from './agent-review-target';
import type { GitHubApi } from './github/api';
import { IMPLEMENT_DENIED } from './implement-loop';
import { descriptionOf, findTemplate, rewritePrompt, type Template } from './pr-description';
import { ensureTicketContainer, REPO_DIR } from './provision';
import { rewriteTarget, sliceRewritePrompt, type RewriteTarget } from './slice-description';
import type { RunSlots } from './slots';
import { ensureBranch } from './workspace-git';

export type PrDescriptionDeps = TargetDeps & {
  slots: RunSlots;
  apiFor: (project: Project) => GitHubApi | null;
  agent?: AgentFn;
};

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

type Run = {
  ticket: Ticket;
  project: Project;
  container: string;
  original: string;
  target: RewriteTarget;
};

/** A slice's own change and spec, else the whole branch against its base. */
function promptFor(db: Db, run: Run, input: { template: Template | null; base: string }): string {
  const { ticket, target } = run;
  const common = {
    guidance: resolveAgent(db, 'pr_description').prompt,
    template: input.template,
    current: withoutUnionLinks(run.original),
    ticket,
  };
  return target.kind === 'slice'
    ? sliceRewritePrompt({
        ...common,
        slice: target.slice,
        from: target.below?.tipSha ?? input.base,
      })
    : rewritePrompt({ ...common, base: input.base });
}

/** The agent's turn, in the ticket's container on its branch. */
async function runRewrite(
  deps: PrDescriptionDeps,
  run: Run,
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
  log({
    type: 'union_pr_description_rewrite',
    template: template?.path ?? null,
    slice: run.target.kind === 'slice' ? run.target.slice.position : null,
  });
  const prompt = promptFor(db, run, { template, base });
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
  const text = descriptionOf(outcome.text);
  return text === ''
    ? { status: 'failed', error: 'The agent wrote no description' }
    : { status: 'ready', original, text };
}

/**
 * The implementer, resumed in the ticket's container (a fresh session if its own is gone), rewrites
 * the description GitHub has from the branch as it is now.
 */
export async function rewrite(
  deps: PrDescriptionDeps,
  row: PrDescription,
  signal: AbortSignal,
): Promise<PrDescriptionOutcome> {
  const { db, runtime } = deps;
  const ticket = getTicket(db, row.ticketId);
  const target = rewriteTarget(db, ticket, row.prNumber);
  if (target.kind === 'gone' || !ticket.branch) {
    return { status: 'failed', error: 'The ticket is no longer on this pull request' };
  }
  if (ticket.phase.kind === 'running') {
    return { status: 'failed', error: 'A step started on the ticket: rewrite once it ends' };
  }
  const project = loadProject(db, ticket.projectId);
  const original = await currentDescription(deps, project, row.prNumber);
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  try {
    return await runRewrite(deps, { ticket, project, container: name, original, target }, signal);
  } finally {
    // A run the user started meanwhile works in the same container: it stops it itself.
    if (getTicket(db, ticket.id).phase.kind !== 'running') {
      await runtime.stop(name);
    }
  }
}
