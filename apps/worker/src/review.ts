import { modelFor, resolveAgent, schema, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { approvedBefore } from './approved';
import type { ImplementDeps } from './implement-loop';
import { PLANNING_TOOLS, buildPrompt } from './prompts';
import { ensureTicketContainer, REPO_DIR } from './provision';
import type { StepContext, StepResult } from './scheduler';
import { ensureBranch } from './workspace-git';

const READ_GIT = ['diff', 'log', 'show', 'status'] as const;

/**
 * Read-only, plus the git commands needed to read the change, in both the plain form and the
 * `git -C <repo>` form agents often use. Chained commands (`&&`) cannot be matched by these rules,
 * hence the one-command-per-call instruction in `reviewContext`.
 */
export const REVIEW_TOOLS = [
  ...PLANNING_TOOLS,
  ...READ_GIT.map((command) => `Bash(git ${command}*)`),
  ...READ_GIT.map((command) => `Bash(git -C ${REPO_DIR} ${command}*)`),
] as const;

export function reviewContext(base: string, branch: string): string {
  return `\n\nThe ticket branch \`${branch}\` is checked out and you are in the repository root. Compare it with the base branch with \`git diff ${base}...HEAD\` and \`git log ${base}..HEAD\`. Run one git command per call: no \`&&\`, no \`cd\`.`;
}

function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project;
}

/** A fresh session (unbiased read) reviews the branch against the approved plan. It never edits. */
export async function runReviewStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const { db, runtime } = deps;
  const { ticket } = context;
  if (!ticket.branch) {
    return {
      kind: 'error',
      error: 'No implementation branch to review: run the implementation first.',
    };
  }
  const project = loadProject(db, ticket.projectId);
  const base = project.config.baseBranch;
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  try {
    await ensureBranch(runtime, name, ticket.branch, base);
    const outcome = await deps.agent(runtime, {
      container: name,
      cwd: REPO_DIR,
      model: modelFor(db, 'final_review'),
      prompt: buildPrompt({
        ticket,
        shared: resolveAgent(db, 'shared').prompt,
        instructions: resolveAgent(db, 'final_review').prompt + reviewContext(base, ticket.branch),
        approved: approvedBefore(db, ticket.id, 'final_review'),
        revision: null,
      }),
      tools: REVIEW_TOOLS,
      signal: context.signal,
      onEvent: context.log,
    });
    if (outcome.kind === 'ok') {
      return { kind: 'ok', output: outcome.text, sessionId: outcome.sessionId };
    }
    return outcome.kind === 'rate_limited'
      ? { kind: 'rate_limited', retryAt: null }
      : { kind: 'error', error: outcome.message };
  } finally {
    await runtime.stop(name);
  }
}
