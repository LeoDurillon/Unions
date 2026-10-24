// The Notion action of a rule: sets properties of the ticket's Notion page (or the reviewed pull request's linked pages), one request per page.
import {
  getTicket,
  integrationOf,
  isEvent,
  linkedNotionPages,
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

type Target = { token: string; pageIds: string[]; sets: NotionSet[] };

/** The Notion pages linked to the review a posted review event is about (none for other events). */
function reviewPages(db: Db, event: Due['event']): string[] {
  if (!isEvent(event, 'pr_review_posted')) {
    return [];
  }
  return linkedNotionPages(db, { kind: 'review', id: event.payload.reviewId }).map(
    (page) => page.id,
  );
}

/** A review's own links to pages are the more precise ones; else the page the ticket came from. */
function pagesOf(
  db: Db,
  event: Due['event'],
  ticket: ReturnType<typeof getTicket> | null,
): string[] {
  const linked = reviewPages(db, event);
  if (linked.length > 0) {
    return linked;
  }
  return ticket?.originKind === 'notion' && ticket.originId ? [ticket.originId] : [];
}

/** The page and the values a delivery sets, or why it cannot be done. */
function targetOf(
  db: Db,
  { delivery, rule, event }: Due,
  action: NotionPropertyAction,
): Target | DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const pageIds = pagesOf(db, event, ticket);
  if (pageIds.length === 0) {
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
  const integration = integrationOf(db, rule.projectId, 'notion');
  if (!project || !integration) {
    return { status: 'failed', error: 'The project is not connected to Notion' };
  }
  const properties = notionSchemaOf(db, rule.projectId)?.properties ?? [];
  const sets = notionSets(properties, action, templateValues(project, ticket, event));
  if ('error' in sets) {
    return { status: 'failed', error: sets.error };
  }
  return { token: integration.secret, pageIds, sets: sets.sets };
}

/** Sets the rule's Notion properties on the review's linked pages, else the ticket's page; says why when it cannot. */
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
    // Each linked page in turn; a retry sets them all again, which changes nothing on those done.
    for (const pageId of target.pageIds) {
      await notion.updatePage(target.token, pageId, properties);
    }
    const pages = target.pageIds.length > 1 ? ` on ${target.pageIds.length} pages` : '';
    return { status: 'succeeded', detail: `${detail}${pages}` };
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
