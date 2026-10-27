// The grouping, explanation, spec and report routes, under a ticket and under a pull request under
// review.
import {
  getTicket,
  notionMarkdown,
  schema,
  startingSpecs,
  type Db,
  type NotionApi,
} from '@union/core';
import { and, desc, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { fail, NOT_FOUND, requireId } from '../http';
import { reviewExplanationRoutes } from './review-explanations';
import { reviewGroupingRoutes, type GroupingTarget } from './review-groupings';
import { reviewReportRoutes } from './review-reports';
import { reviewSpecRoutes } from './review-specs';

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
    refusal = 'No diff yet: run the implementation first.';
  } else if (ticket.phase.kind === 'running') {
    refusal =
      'Wait for the current run to finish: the agent reads the change in the same workspace.';
  }
  return {
    owner: { kind: 'ticket', id },
    project: projectOf(db, ticket.projectId),
    prNumber: ticket.prNumber,
    ticketText: ticket.originKind === 'notion' ? notionMarkdown(ticket.body) : ticket.body,
    starts: startingSpecs({
      kind: 'ticket',
      notionOrigin:
        ticket.originKind === 'notion' && ticket.originId
          ? { id: ticket.originId, url: ticket.originUrl }
          : null,
    }),
    headSha: snapshot?.headSha ?? null,
    refusal,
    patchOf: (path) =>
      snapshot
        ? db
            .select({ patch: schema.diffFiles.patch })
            .from(schema.diffFiles)
            .where(
              and(eq(schema.diffFiles.snapshotId, snapshot.id), eq(schema.diffFiles.path, path)),
            )
            .get()?.patch
        : undefined,
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
    starts: startingSpecs({ kind: 'review', prNumber: number }),
    headSha: review.headSha,
    refusal:
      review.files && review.headSha ? null : 'Open the diff first: its files are not read yet.',
    patchOf: (path) => review.files?.find((file) => file.path === path)?.patch,
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

/** `/api/tickets/:id/explanations`. */
export function ticketExplanationRoutes(db: Db): Hono {
  return reviewExplanationRoutes(db, (c) => ticketTarget(db, c));
}

/** `/api/projects/:projectId/pull-requests/reviews/:number/explanations`. */
export function pullRequestExplanationRoutes(db: Db): Hono {
  return reviewExplanationRoutes(db, (c) => pullRequestTarget(db, c));
}

/** `/api/tickets/:id/specs`. */
export function ticketSpecRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  return reviewSpecRoutes({ db, github, notion }, (c) => ticketTarget(db, c));
}

/** `/api/projects/:projectId/pull-requests/reviews/:number/specs`. */
export function pullRequestSpecRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  return reviewSpecRoutes({ db, github, notion }, (c) => pullRequestTarget(db, c));
}

/** `/api/tickets/:id/reports`. */
export function ticketReportRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  return reviewReportRoutes({ db, github, notion }, (c) => ticketTarget(db, c));
}

/** `/api/projects/:projectId/pull-requests/reviews/:number/reports`. */
export function pullRequestReportRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  return reviewReportRoutes({ db, github, notion }, (c) => pullRequestTarget(db, c));
}
