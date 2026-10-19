// The Notion action of a rule: sets properties of the ticket's Notion page (or the reviewed pull request's), in one request.
import {
  getTicket,
  isEvent,
  notionSchemaOf,
  notionSets,
  notionSetsText,
  NotionError,
  schema,
  templateValues,
  type Db,
  type DeliveryOutcome,
  type NotionApi,
  type NotionPropertyAction,
  type NotionSet,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { ActionTarget, Due } from './target';

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
/** Notion allows about three requests a second. */
const PER_TICK = 3;

type Target = { token: string; pageId: string; sets: NotionSet[] };

/** The Notion page linked to the review a posted review event is about, if any. */
function reviewPage(db: Db, event: Due['event']): string | null {
  if (!isEvent(event, 'pr_review_posted')) {
    return null;
  }
  const review = db
    .select({ notionPageId: schema.currentReviews.notionPageId })
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, event.payload.reviewId))
    .get();
  return review?.notionPageId ?? null;
}

/** The page and the values a delivery sets, or why it cannot be done. */
function targetOf(
  db: Db,
  { delivery, rule, event }: Due,
  action: NotionPropertyAction,
): Target | DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  // A review's own link to a page is the more precise one; else the page the ticket came from.
  const pageId = reviewPage(db, event) ?? ticket?.notionPageId;
  if (!pageId) {
    return {
      status: 'skipped',
      detail: isEvent(event, 'pr_review_posted')
        ? 'The pull request is not linked to a Notion page'
        : 'The ticket was not imported from Notion',
    };
  }
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  if (!project?.notionToken) {
    return { status: 'failed', error: 'The project is not connected to Notion' };
  }
  const properties = notionSchemaOf(db, rule.projectId)?.properties ?? [];
  const sets = notionSets(properties, action, templateValues(project, ticket, event));
  if ('error' in sets) {
    return { status: 'failed', error: sets.error };
  }
  return { token: project.notionToken, pageId, sets: sets.sets };
}

/** Sets the rule's Notion properties on the ticket's page; says why when it cannot. */
async function deliver(
  db: Db,
  notion: NotionApi,
  due: Due,
  action: NotionPropertyAction,
): Promise<DeliveryOutcome> {
  const target = targetOf(db, due, action);
  if ('status' in target) {
    return target;
  }
  const detail = notionSetsText(target.sets);
  const properties = Object.fromEntries(target.sets.map((set) => [set.property.id, set.value]));
  try {
    await notion.updatePage(target.token, target.pageId, properties);
    return { status: 'succeeded', detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Rate limits, Notion outages and network failures pass: try again later.
    const temporary =
      !(error instanceof NotionError) ||
      error.status === TOO_MANY_REQUESTS ||
      error.status >= SERVER_ERROR;
    return temporary
      ? { status: 'retry', error: message }
      : { status: 'failed', error: message, detail: `Tried: ${detail}` };
  }
}

export function notionTarget(db: Db, notion: NotionApi): ActionTarget<'notion_property'> {
  return { perTick: PER_TICK, deliver: (due, action) => deliver(db, notion, due, action) };
}
