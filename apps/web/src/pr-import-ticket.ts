// Creates the ticket a pull request is imported as: on its branch and base, its planning steps prefilled, its description as the implementation's output, and the worker asked to adopt it.
import { createTicket, emitEvent, schema, type Db, type Project, type Ticket } from '@union/core';
import { and, eq, or } from 'drizzle-orm';

import type { PullRequestSource } from './api-pr-import-types';
import { BAD_REQUEST, fail } from './http';
import type { PullRequestPlan } from './pr-import-plan';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The planning outputs read from the issue, each keeping its comment so the worker edits it. */
function savePlanningSteps(tx: Tx, ticketId: number, plan: PullRequestPlan): void {
  for (const step of plan.steps) {
    tx.insert(schema.stepOutputs)
      .values({
        ticketId,
        step: step.step,
        version: step.version,
        content: step.content,
        validation: step.validation,
        githubCommentId: step.commentId,
      })
      .run();
    emitEvent(tx, {
      type: 'step_output',
      ticketId,
      payload: { step: step.step, version: step.version },
    });
  }
}

/** The pull request's description as the implementation's output, waiting for approval. */
function saveImplementation(
  tx: Tx,
  ticketId: number,
  source: PullRequestSource,
  plan: PullRequestPlan,
): void {
  const description = source.body.trim();
  tx.insert(schema.stepOutputs)
    .values({
      ticketId,
      step: 'implement',
      version: 1,
      content: description === '' ? `Imported from pull request #${source.number}.` : description,
      githubCommentId: plan.implementCommentId,
    })
    .run();
  emitEvent(tx, { type: 'step_output', ticketId, payload: { step: 'implement', version: 1 } });
}

/** The project a request names; a 400 when there is none. */
export function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw fail(BAD_REQUEST, 'Unknown project');
  }
  return project;
}

/** The project's ticket already on the pull request, or on the issue the ticket would take. */
export function existingTicket(
  db: Db,
  projectId: number,
  { source, plan }: { source: PullRequestSource; plan: PullRequestPlan },
): number | null {
  const onPull = eq(schema.tickets.prNumber, source.number);
  const onIssue = plan.issue ? eq(schema.tickets.issueNumber, plan.issue.number) : undefined;
  const row = db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(and(eq(schema.tickets.projectId, projectId), or(onPull, onIssue)))
    .get();
  return row?.id ?? null;
}

/** The ticket on the pull request; the worker then moves it to Implementation, awaiting approval. */
export function createImportedTicket(
  db: Db,
  projectId: number,
  source: PullRequestSource,
  plan: PullRequestPlan,
): Ticket {
  const { issue } = plan;
  const ticket = createTicket(db, {
    projectId,
    title: plan.title,
    body: plan.body,
    issue: issue ? { number: issue.number, nodeId: issue.nodeId } : undefined,
    flow: plan.flow,
  });
  return db.transaction((tx) => {
    const updated = tx
      .update(schema.tickets)
      .set({
        branch: source.headBranch,
        chosenBaseBranch: source.baseBranch,
        prNumber: source.number,
        prReadyAt: source.draft ? null : Date.now(),
        pushedSha: source.headSha,
      })
      .where(eq(schema.tickets.id, ticket.id))
      .returning()
      .get();
    savePlanningSteps(tx, ticket.id, plan);
    saveImplementation(tx, ticket.id, source, plan);
    emitEvent(tx, {
      type: 'pull_request_linked',
      ticketId: ticket.id,
      payload: { number: source.number },
    });
    tx.insert(schema.commands)
      .values({ type: 'adopt_pull_request', ticketId: ticket.id, payload: null })
      .run();
    return updated;
  });
}
