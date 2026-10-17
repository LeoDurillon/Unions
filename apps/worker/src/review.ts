import {
  type Db,
  effortFor,
  listAttachments,
  listProjectFiles,
  getTicket,
  modelFor,
  type Project,
  resolveAgent,
  schema,
  stepSharedPrompt,
  ticketBase,
  toolsFor,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { approvedBefore } from './approved';
import type { ImplementDeps } from './implement-loop';
import { buildPrompt, parentContext } from './prompts';
import { ensureTicketContainer, REPO_DIR } from './provision';
import { previousReview, previousReviewSection, type ReviewedCommit } from './review-previous';
import type { StepContext, StepResult } from './scheduler';
import { ensureBranch, headCommit, inHistory } from './workspace-git';

/** Reading the change needs git; the default review tools allow the read-only git commands. */
export function reviewContext(base: string, branch: string): string {
  return `\n\nThe ticket branch \`${branch}\` is checked out and you are in the repository root. Compare it with the base branch with \`git diff ${base}...HEAD\` and \`git log ${base}..HEAD\`. Run one git command per call: no \`&&\`, no \`cd\`.`;
}

/** The earlier review's findings and what changed since, for a branch reviewed before; else empty. */
async function earlierReview(
  deps: ImplementDeps,
  container: string,
  ticketId: number,
): Promise<string> {
  const previous = previousReview(deps.db, ticketId);
  if (!previous) {
    return '';
  }
  let reviewed: ReviewedCommit = 'unknown';
  if (previous.headSha !== null) {
    const kept = await inHistory(deps.runtime, container, previous.headSha);
    reviewed = kept ? 'in_history' : 'rewritten';
  }
  return `\n\n${previousReviewSection(previous, reviewed)}`;
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
  const { name } = await ensureTicketContainer(db, runtime, deps.config, ticket);
  const base = ticketBase(project, getTicket(db, ticket.id));
  try {
    await ensureBranch(runtime, name, ticket.branch, base);
    const headSha = await headCommit(runtime, name);
    const earlier = await earlierReview(deps, name, ticket.id);
    const outcome = await deps.agent(runtime, {
      container: name,
      cwd: REPO_DIR,
      model: modelFor(db, 'final_review'),
      effort: effortFor(db, 'final_review'),
      prompt: buildPrompt({
        ticket,
        ...parentContext(db, ticket),
        shared: stepSharedPrompt(db, ticket.projectId, 'final_review'),
        instructions:
          resolveAgent(db, 'final_review').prompt + reviewContext(base, ticket.branch) + earlier,
        approved: approvedBefore(db, ticket.id, 'final_review'),
        revision: null,
        step: 'final_review',
        attachments: listAttachments(db, ticket.id),
        projectFiles: listProjectFiles(db, ticket.projectId),
      }),
      tools: toolsFor(db, 'final_review'),
      signal: context.signal,
      onEvent: context.log,
    });
    if (outcome.kind === 'ok') {
      return { kind: 'ok', output: outcome.text, sessionId: outcome.sessionId, headSha };
    }
    return outcome.kind === 'rate_limited'
      ? { kind: 'rate_limited', retryAt: null }
      : { kind: 'error', error: outcome.message };
  } finally {
    await runtime.stop(name);
  }
}
