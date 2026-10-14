import {
  type ContainerRuntime,
  type Db,
  effortFor,
  listAttachments,
  listProjectFiles,
  modelFor,
  parentOf,
  type Project,
  resolveAgent,
  sharedPrompt,
  toolsFor,
} from '@union/core';

import { runAgent, runResumable } from './agent';
import { runCodeStep } from './agent-services-step';
import { approvedBefore } from './approved';
import type { GitHubApi } from './github/api';
import { buildPrompt, isPlanningStep } from './prompts';
import { ensureTicketContainer, REPO_DIR, type ProvisionConfig } from './provision';
import { runReviewStep } from './review';
import type { StepContext, StepExecutor, StepResult } from './scheduler';

/** Every pipeline step: planning, implementation and final review. */
export function createExecutor(
  db: Db,
  runtime: ContainerRuntime,
  config: ProvisionConfig,
  github: (project: Project) => GitHubApi | null,
): StepExecutor {
  return async (context: StepContext): Promise<StepResult> => {
    const { ticket, step } = context;
    const deps = { db, runtime, config, github, agent: runAgent };
    if (step === 'implement' || step === 'rebase') {
      return runCodeStep(deps, context, step);
    }
    if (step === 'final_review') {
      return runReviewStep(deps, context);
    }
    if (!isPlanningStep(step)) {
      return { kind: 'error', error: `Unknown step ${JSON.stringify(step)}` };
    }
    // Read on every run, so edits made in the settings apply to the next run.
    const agent = resolveAgent(db, step);
    const container = await ensureTicketContainer(db, runtime, config, ticket);
    try {
      // The planning prompt carries the previous version and the feedback, so a lost session can
      // start over from the same prompt.
      const prompt = buildPrompt({
        ticket,
        parent: parentOf(db, ticket),
        shared: sharedPrompt(db, ticket.projectId),
        instructions: agent.prompt,
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
  };
}
