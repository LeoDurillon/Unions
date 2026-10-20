// The split plan: a read-only agent proposes the slices of a stack, which the user edits and approves.
import {
  effortFor,
  getTicket,
  listAttachments,
  modelFor,
  parseSplitPlan,
  resolveAgent,
  stepSharedPrompt,
  ticketBase,
  toolsFor,
  type ContainerRuntime,
  type Ticket,
} from '@union/core';

import type { AgentFn, AgentOutcome, AgentRun } from './agent';
import { approvedBefore } from './approved';
import type { ImplementDeps } from './implement-loop';
import { buildPrompt, parentContext } from './prompts';
import { ensureTicketContainer, REPO_DIR } from './provision';
import { loadProject, reviewContext } from './review';
import type { StepContext, StepResult } from './scheduler';
import { ensureBranch } from './workspace-git';

function planPrompt(
  deps: ImplementDeps,
  context: StepContext,
  base: string,
  ticket: Ticket,
): string {
  const { db } = deps;
  return buildPrompt({
    ticket,
    ...parentContext(db, ticket),
    shared: stepSharedPrompt(db, ticket.projectId, 'split_plan'),
    instructions: resolveAgent(db, 'split_plan').prompt + reviewContext(base, ticket.branch ?? ''),
    approved: approvedBefore(db, ticket.id, 'final_review'),
    revision: context.revision,
    attachments: listAttachments(db, ticket.id),
  });
}

/** One more turn when the plan cannot be read: the problems, and the whole plan again. */
function fixPrompt(problems: readonly string[]): string {
  return `The host cannot read your plan:\n\n${problems.map((problem) => `- ${problem}`).join('\n')}\n\nOutput the whole plan again, in the format asked, and nothing else.`;
}

function failure(outcome: Exclude<AgentOutcome, { kind: 'ok' }>): StepResult {
  return outcome.kind === 'rate_limited'
    ? { kind: 'rate_limited', retryAt: null }
    : { kind: 'error', error: outcome.message };
}

/** The plan the agent answered; one more turn in its session when the host cannot read it. */
export async function settlePlan(
  agent: AgentFn,
  runtime: ContainerRuntime,
  run: AgentRun,
  outcome: AgentOutcome,
): Promise<StepResult> {
  if (outcome.kind !== 'ok') {
    return failure(outcome);
  }
  const plan = parseSplitPlan(outcome.text);
  if (plan.ok) {
    return { kind: 'ok', output: outcome.text, sessionId: outcome.sessionId };
  }
  const prompt = fixPrompt(plan.problems);
  const fixed = await agent(runtime, { ...run, prompt, resumeSessionId: outcome.sessionId });
  if (fixed.kind !== 'ok') {
    return failure(fixed);
  }
  const again = parseSplitPlan(fixed.text);
  return again.ok
    ? { kind: 'ok', output: fixed.text, sessionId: fixed.sessionId }
    : { kind: 'error', error: `The plan cannot be read:\n\n${again.problems.join('\n')}` };
}

/** Proposes the slices from the spec, the diff and the commits; a revision resumes its session. */
export async function runSplitPlanStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const { db, runtime } = deps;
  const ticket = getTicket(db, context.ticket.id);
  if (!ticket.branch) {
    return { kind: 'error', error: 'No branch to split: run the implementation first.' };
  }
  const base = ticketBase(loadProject(db, ticket.projectId), ticket);
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  try {
    await ensureBranch(runtime, name, ticket.branch, base);
    const run: AgentRun = {
      container: name,
      cwd: REPO_DIR,
      model: modelFor(db, 'split_plan'),
      effort: effortFor(db, 'split_plan'),
      prompt: planPrompt(deps, context, base, ticket),
      tools: toolsFor(db, 'split_plan'),
      resumeSessionId: context.resumeSessionId,
      signal: context.signal,
      onEvent: context.log,
    };
    return await settlePlan(deps.agent, runtime, run, await deps.agent(runtime, run));
  } finally {
    await runtime.stop(name);
  }
}
