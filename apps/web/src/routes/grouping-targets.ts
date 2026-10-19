import { getTicket, notionMarkdown, schema, type Db, type NotionApi } from '@union/core';
import { and, desc, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { fail, NOT_FOUND, requireId } from '../http';
import { reviewGroupingRoutes, type GroupingTarget } from './review-groupings';

function projectOf(db: Db, id: number): typeof schema.projects.$inferSelect {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  return project;
}

function loadTicket(db: Db, id: number): ReturnType<typeof getTicket> {
  try {
    return getTicket(db, id);
  } catch {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
}

/** A ticket's branch, as its review page shows it: the newest diff snapshot. */
function ticketTarget(db: Db, c: Context): GroupingTarget {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = loadTicket(db, id);
  const snapshot = db
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, id))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
  let refusal: string | null = null;
  if (!ticket.branch || !snapshot) {
    refusal = 'No diff to group yet: run the implementation first.';
  } else if (ticket.phase.kind === 'running') {
    refusal =
      'Wait for the current run to finish: the agent reads the change in the same workspace.';
  }
  return {
    owner: { kind: 'ticket', id },
    project: projectOf(db, ticket.projectId),
    prNumber: ticket.prNumber,
    ticketText: ticket.notionPageId ? notionMarkdown(ticket.body) : ticket.body,
    notionPageId: ticket.notionPageId,
    headSha: snapshot?.headSha ?? null,
    refusal,
  };
}

/** A pull request under review, at the commit its files were read at. */
function pullRequestTarget(db: Db, c: Context): GroupingTarget {
  const projectId = requireId(c.req.param('projectId'), 'project id');
  const number = requireId(c.req.param('number'), 'pull request number');
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, projectId),
        eq(schema.currentReviews.prNumber, number),
      ),
    )
    .get();
  if (!review) {
    throw fail(NOT_FOUND, `#${number} is not among the current reviews`);
  }
  return {
    owner: { kind: 'review', id: review.id },
    project: projectOf(db, projectId),
    prNumber: number,
    ticketText: null,
    notionPageId: review.notionPageId,
    headSha: review.headSha,
    refusal:
      review.files && review.headSha ? null : 'Open the diff first: its files are not read yet.',
  };
}

/** `/api/tickets/:id/groupings`. */
export function ticketGroupingRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  return reviewGroupingRoutes(db, { github, notion }, (c) => ticketTarget(db, c));
}

/** `/api/projects/:projectId/pull-requests/reviews/:number/groupings`. */
export function pullRequestGroupingRoutes(
  db: Db,
  github: OnboardingGitHub,
  notion: NotionApi,
): Hono {
  return reviewGroupingRoutes(db, { github, notion }, (c) => pullRequestTarget(db, c));
}
