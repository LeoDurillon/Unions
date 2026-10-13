import {
  type Db,
  effortFor,
  modelFor,
  parentOf,
  resolveAgent,
  schema,
  sharedPrompt,
  toolsFor,
} from '@union/core';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { runResumable, type AgentOutcome } from './agent';
import { approvedBefore } from './approved';
import type { GateResult } from './gate';
import { IMPLEMENT_DENIED, type Workspace } from './implement-loop';
import { gateHint } from './implement-prompts';
import { COMMIT_HOOK_HINT } from './leftovers';
import { buildPrompt } from './prompts';
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
export type Rebase = Workspace & { branch: string; base: string; before: string };

/** The implementer's session (or the last rebase's, which continued it), resumed for the rebase. */
function implementerSession(db: Db, ticketId: number): string | null {
  const run = db
    .select()
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.ticketId, ticketId),
        eq(schema.runs.status, 'succeeded'),
        inArray(schema.runs.step, ['implement', 'rebase']),
      ),
    )
    .orderBy(desc(schema.runs.id))
    .get();
  return run?.sessionId ?? null;
}

function instructions(db: Db, rebase: Rebase): string {
  const { base, branch, project } = rebase;
  return `${resolveAgent(db, 'rebase').prompt}\n\nThe base branch was fetched just now as \`origin/${base}\`; your branch is \`${branch}\`.${gateHint(project.config.gateCommand)}${COMMIT_HOOK_HINT}`;
}

/** Resumes the implementer's session with the rebase prompt; a fresh session gets the whole task first. */
export function runRebaseAgent(rebase: Rebase): Promise<AgentOutcome> {
  const { deps, context, container } = rebase;
  const { db } = deps;
  const session = implementerSession(db, context.ticket.id);
  const fresh = buildPrompt({
    ticket: context.ticket,
    parent: parentOf(db, context.ticket),
    shared: sharedPrompt(db, context.ticket.projectId),
    instructions: instructions(db, rebase),
    approved: approvedBefore(db, context.ticket.id, 'final_review'),
    revision: null,
  });
  return runResumable(
    deps.agent,
    deps.runtime,
    {
      container,
      cwd: REPO_DIR,
      model: modelFor(db, 'rebase'),
      effort: effortFor(db, 'rebase'),
      prompt: session ? instructions(db, rebase) : fresh,
      tools: toolsFor(db, 'rebase'),
      denied: REBASE_DENIED,
      resumeSessionId: session,
      signal: context.signal,
      onEvent: context.log,
    },
    fresh,
  );
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
  const checks =
    gate && gateCommand
      ? `**Checks** (\`${gateCommand}\`): passing.`
      : '**Checks:** none configured.';
  return [
    input.agentReport.trim(),
    '---',
    `**Rebased** \`${rebase.branch}\` onto \`origin/${rebase.base}\` (${rebase.before.slice(0, SHORT_SHA)} → ${after.slice(0, SHORT_SHA)}) and force-pushed.`,
    checks,
  ].join('\n\n');
}
