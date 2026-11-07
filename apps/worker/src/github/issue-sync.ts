// The issue part of the sync: the ticket's GitHub issue, opened once, and one comment per step kept up to date.
import {
  customAgentNames,
  emitEvent,
  getTicket,
  schema,
  STEPS,
  type Db,
  type Step,
  type StepOutput,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';
import { hashBody, renderIssueBody, renderStepComment, stepMarker } from './render';

/** Opens the ticket's issue when it has none. */
export async function ensureIssue(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticketId: number,
): Promise<void> {
  const ticket = getTicket(db, ticketId);
  if (ticket.issueNumber !== null && ticket.issueNodeId !== null) {
    return;
  }
  const issue = await api.createIssue(repo, {
    title: ticket.title,
    body: renderIssueBody(ticket.id, ticket.body),
  });
  db.update(schema.tickets)
    .set({ issueNumber: issue.number, issueNodeId: issue.nodeId })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  emitEvent(db, {
    type: 'github_issue_created',
    ticketId,
    payload: { issueNumber: issue.number },
  });
}

/** One comment per step on the ticket's issue, edited as new versions, approvals and feedback come. */
export async function pushComments(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticketId: number,
): Promise<void> {
  const ticket = getTicket(db, ticketId);
  if (ticket.issueNumber === null) {
    return;
  }
  const outputs = db
    .select()
    .from(schema.stepOutputs)
    .where(eq(schema.stepOutputs.ticketId, ticketId))
    .orderBy(schema.stepOutputs.version)
    .all();
  // The custom steps of its flow too; rebase and simplify have no comment.
  const steps = new Set([...STEPS, ...(ticket.flow ?? [])]);
  const target = { db, api, repo, ticket, issueNumber: ticket.issueNumber };
  for (const step of steps) {
    const versions = outputs.filter((output) => output.step === step);
    if (versions.length > 0) {
      await pushStepComment(target, step, versions);
    }
  }
}

type CommentTarget = { db: Db; api: GitHubApi; repo: RepoRef; ticket: Ticket; issueNumber: number };

async function pushStepComment(
  target: CommentTarget,
  step: Step,
  versions: StepOutput[],
): Promise<void> {
  const { db, api, repo, ticket, issueNumber } = target;
  const latest = versions.at(-1);
  if (!latest) {
    return;
  }
  const body = renderStepComment(ticket.id, step, versions, customAgentNames(db));
  const hash = hashBody(body);
  if (latest.githubBodyHash === hash) {
    return;
  }
  const known = versions.findLast((version) => version.githubCommentId !== null);
  const commentId = known?.githubCommentId ?? (await findComment(target, step)) ?? null;
  if (commentId === null) {
    const id = await api.createComment(repo, issueNumber, body);
    saveComment(db, latest.id, id, hash);
  } else {
    await api.updateComment(repo, commentId, body);
    saveComment(db, latest.id, commentId, hash);
  }
}

function saveComment(db: Db, outputId: number, commentId: string, hash: string): void {
  db.update(schema.stepOutputs)
    .set({ githubCommentId: commentId, githubBodyHash: hash })
    .where(eq(schema.stepOutputs.id, outputId))
    .run();
}

/** Recovers a comment we posted before a DB reset, found by its hidden marker. */
async function findComment(target: CommentTarget, step: Step): Promise<string | undefined> {
  const marker = stepMarker(target.ticket.id, step);
  const comments = await target.api.listComments(target.repo, target.issueNumber);
  return comments.find((comment) => comment.body.includes(marker))?.id;
}
