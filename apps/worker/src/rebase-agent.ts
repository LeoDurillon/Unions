import {
  type Db,
  effortFor,
  modelFor,
  resolveAgent,
  schema,
  sharedPrompt,
  toolsFor,
} from '@union/core';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { runResumable, type AgentOutcome, type AgentRun } from './agent';
import { approvedBefore } from './approved';
import type { GateResult } from './gate';
import { IMPLEMENT_DENIED, type Workspace } from './implement-loop';
import { agentServicesHint, gateHint } from './implement-prompts';
import { askSession, COMMIT_HOOK_HINT, type Ask } from './leftovers';
import { buildPrompt, parentContext } from './prompts';
import { REPO_DIR } from './provision';

const SHORT_SHA = 7;

/** A rebase that reached GitHub: the agent's answer and the last check result. */
export type Pushed = {
  pushed: true;
  outcome: Extract<AgentOutcome, { kind: 'ok' }>;
  gate: GateResult | null;
};

/** The implementer's denied rules, minus the ones a rebase needs (`git merge*` also covers `merge-base`). */
export const REBASE_DENIED = IMPLEMENT_DENIED.filter(
  (rule) => rule !== 'Bash(git rebase*)' && rule !== 'Bash(git merge*)',
);

/** A rebase in progress: the workspace, its branch and base, and the commit to restore on failure. */
export type Rebase = Workspace & {
  branch: string;
  base: string;
  before: string;
  /** A stack restacked after a slice merged: `upstream` is that slice's tip; `hostOnly`: no agent. */
  restack?: { upstream: string; hostOnly: boolean };
  /** A change of target: the branch leaves `from` for `base`, taking only its own commits. */
  retarget?: { from: string };
};

/** A turn in the implementer's own session: the rebase, or a rewrite of its history. */
export type SessionTask = {
  agent: 'rebase' | 'simplify' | 'split';
  instructions: string;
  denied: readonly string[];
};

/**
 * The implementer's session (or the last run that continued it), resumed for the task. A clean
 * rebase ran no agent and saved no session: it is skipped.
 */
function implementerSession(db: Db, ticketId: number): string | null {
  const run = db
    .select()
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.ticketId, ticketId),
        eq(schema.runs.status, 'succeeded'),
        isNotNull(schema.runs.sessionId),
        inArray(schema.runs.step, [
          'implement',
          'rebase',
          'retarget',
          'simplify',
          'split',
          'restack',
        ]),
      ),
    )
    .orderBy(desc(schema.runs.id))
    .get();
  return run?.sessionId ?? null;
}

/** The rebase prompt; `why` says what the host's own rebase left for the agent. */
function rebaseTask(db: Db, rebase: Rebase, why = ''): SessionTask {
  const { base, branch, project, deps } = rebase;
  const instructions = `${resolveAgent(db, 'rebase').prompt}\n\nThe base branch was fetched just now as \`origin/${base}\`; your branch is \`${branch}\`.${why}${gateHint(project.config.gateCommand)}${agentServicesHint(deps.services)}${COMMIT_HOOK_HINT}`;
  return { agent: 'rebase', instructions, denied: REBASE_DENIED };
}

function agentRun(
  rebase: Rebase,
  task: SessionTask,
  { prompt, session }: { prompt: string; session: string | null },
): AgentRun {
  const { deps, context, container } = rebase;
  return {
    container,
    cwd: REPO_DIR,
    model: modelFor(deps.db, task.agent),
    effort: effortFor(deps.db, task.agent),
    prompt,
    tools: toolsFor(deps.db, task.agent),
    denied: task.denied,
    resumeSessionId: session,
    signal: context.signal,
    onEvent: context.log,
  };
}

/** Resumes the implementer's session with the task's prompt; a fresh session gets the whole task first. */
export function runInImplementerSession(rebase: Rebase, task: SessionTask): Promise<AgentOutcome> {
  const { deps, context } = rebase;
  const { db } = deps;
  const session = implementerSession(db, context.ticket.id);
  const fresh = buildPrompt({
    ticket: context.ticket,
    ...parentContext(db, context.ticket),
    shared: sharedPrompt(db, context.ticket.projectId),
    instructions: task.instructions,
    approved: approvedBefore(db, context.ticket.id, 'final_review'),
    revision: null,
  });
  const prompt = session ? task.instructions : fresh;
  return runResumable(deps.agent, deps.runtime, agentRun(rebase, task, { prompt, session }), fresh);
}

/** Another turn of a task in the session its first turn ran in (a fix the host asks for). */
export function continueTask(
  rebase: Rebase,
  task: SessionTask,
  session: string,
): Promise<AgentOutcome> {
  const run = agentRun(rebase, task, { prompt: task.instructions, session });
  return rebase.deps.agent(rebase.deps.runtime, run);
}

/** Resumes the implementer's session with the rebase prompt and why the host's rebase needs it. */
export function runRebaseAgent(rebase: Rebase, why: string): Promise<AgentOutcome> {
  return runInImplementerSession(rebase, rebaseTask(rebase.deps.db, rebase, why));
}

/** Another turn in the task's session, for the commit message of changes it left. */
export function askInSession(rebase: Rebase, task: SessionTask, session: string | null): Ask {
  return askSession(
    rebase.deps.agent,
    rebase.deps.runtime,
    agentRun(rebase, task, { prompt: '', session }),
  );
}

/** Another turn in the rebase agent's session, for the commit message of changes it left. */
export function askRebaseAgent(rebase: Rebase, session: string | null): Ask {
  return askInSession(rebase, rebaseTask(rebase.deps.db, rebase), session);
}

/** What the host checked and pushed, under the agent's own report. */
export function renderRebaseReport(input: {
  agentReport: string;
  rebase: Pick<Rebase, 'base' | 'branch' | 'before'>;
  after: string;
  gateCommand: string | undefined;
  gate: GateResult | null;
}): string {
  const { rebase, after, gateCommand, gate } = input;
  return [
    input.agentReport.trim(),
    '---',
    `**Rebased** \`${rebase.branch}\` onto \`origin/${rebase.base}\` (${moved(rebase.before, after)}) and force-pushed.`,
    checksLine(gateCommand, gate),
  ].join('\n\n');
}

function moved(before: string, after: string): string {
  return `${before.slice(0, SHORT_SHA)} → ${after.slice(0, SHORT_SHA)}`;
}

function checksLine(gateCommand: string | undefined, gate: GateResult | null): string {
  return gate && gateCommand
    ? `**Checks** (\`${gateCommand}\`): passing.`
    : '**Checks:** none configured.';
}

/** The report of a rebase git did alone: no conflict, so no agent ran and the review still applies. */
export function renderCleanReport(input: {
  rebase: Pick<Rebase, 'base' | 'branch' | 'before'>;
  after: string;
  gateCommand: string | undefined;
  gate: GateResult | null;
}): string {
  const { rebase, after, gateCommand, gate } = input;
  return [
    `**Rebased** \`${rebase.branch}\` onto \`origin/${rebase.base}\` (${moved(rebase.before, after)}) with no conflict, and force-pushed. No agent ran.`,
    checksLine(gateCommand, gate),
    'The code reviewed before did not change: the final review still applies.',
  ].join('\n\n');
}
