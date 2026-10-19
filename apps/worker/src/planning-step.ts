// A step that writes markdown and changes no file: the planning steps and the custom agents.
import {
  effortFor,
  getTicket,
  isCustomStep,
  listAttachments,
  listProjectFiles,
  modelFor,
  resolveAgent,
  stepSharedPrompt,
  toolsFor,
  type ContainerRuntime,
  type CustomStep,
  type Db,
  type PlanningStep,
} from '@union/core';

import { runAgent, runResumable } from './agent';
import { approvedBefore } from './approved';
import { customStepContext } from './custom-step';
import { buildPrompt, parentContext } from './prompts';
import { ensureTicketContainer, REPO_DIR, type ProvisionConfig } from './provision';
import type { StepContext, StepResult } from './scheduler';

type PlanningDeps = { db: Db; runtime: ContainerRuntime; config: ProvisionConfig };

/** Runs a planning or custom step in the ticket's container; the container stops after. */
export async function runPlanningStep(
  { db, runtime, config }: PlanningDeps,
  context: StepContext & { step: PlanningStep | CustomStep },
): Promise<StepResult> {
  const { ticket, step } = context;
  // Read on every run, so edits made in the settings apply to the next run.
  const agent = resolveAgent(db, step);
  if (agent.prompt.trim() === '') {
    return { kind: 'error', error: `${agent.custom?.name ?? step} has no prompt yet` };
  }
  const container = await ensureTicketContainer(db, runtime, config, ticket);
  try {
    // The planning prompt carries the previous version and the feedback, so a lost session can
    // start over from the same prompt.
    // Re-read: the first clone has just set the ticket's base branch.
    const cloned = getTicket(db, ticket.id);
    const readChange = isCustomStep(step)
      ? await customStepContext({ db, runtime }, cloned, step, container.name)
      : '';
    const prompt = buildPrompt({
      ticket: cloned,
      ...parentContext(db, cloned),
      shared: stepSharedPrompt(db, ticket.projectId, step),
      instructions: agent.prompt + readChange,
      approved: approvedBefore(db, ticket.id, step),
      revision: context.revision,
      attachments: listAttachments(db, ticket.id),
      projectFiles: listProjectFiles(db, ticket.projectId),
    });
    const run = {
      container: container.name,
      cwd: REPO_DIR,
      model: modelFor(db, step),
      effort: effortFor(db, step),
      prompt,
      tools: toolsFor(db, step),
      resumeSessionId: context.resumeSessionId,
      signal: context.signal,
      onEvent: context.log,
    };
    const outcome = await runResumable(runAgent, runtime, run, prompt);
    if (outcome.kind === 'ok') {
      return { kind: 'ok', output: outcome.text, sessionId: outcome.sessionId };
    }
    return outcome.kind === 'rate_limited'
      ? { kind: 'rate_limited', retryAt: null }
      : { kind: 'error', error: outcome.message };
  } finally {
    await runtime.stop(container.name);
  }
}
