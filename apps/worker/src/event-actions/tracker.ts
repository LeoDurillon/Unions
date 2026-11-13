// The tracker actions of rules (move an item, set its fields, comment on it): the items they act on, then the adapter's.
// The items are a posted review's linked ones of the tracker, else the item the ticket was imported from.
import {
  getTicket,
  integrationKind,
  integrationOf,
  isEvent,
  linkedTrackerItems,
  schema,
  templateValues,
  trackerAdapter,
  type Db,
  type DeliveryOutcome,
  type IntegrationApis,
  type TrackerAction,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { noTicket, type ActionTargets, type Due } from './target';

type TrackerKind = 'tracker_status' | 'tracker_fields' | 'tracker_comment';

type Ticket = ReturnType<typeof getTicket>;

/** A review's own linked items are the more precise ones; else the item the ticket came from. */
function itemsOf(
  db: Db,
  due: Due,
  ticket: Ticket | null,
  tracker: TrackerAction['tracker'],
): string[] | DeliveryOutcome {
  const { label, itemLabel } = integrationKind(tracker);
  const reviewed = isEvent(due.event, 'pr_review_posted') ? due.event.payload.reviewId : null;
  const linked =
    reviewed === null
      ? []
      : linkedTrackerItems(db, { kind: 'review', id: reviewed }, tracker).map((item) => item.id);
  if (linked.length > 0) {
    return linked;
  }
  if (reviewed !== null && !ticket) {
    return {
      status: 'skipped',
      detail: `The pull request is not linked to a ${label} ${itemLabel}`,
    };
  }
  if (!ticket) {
    return noTicket(due.delivery);
  }
  return ticket.originKind === tracker && ticket.originId
    ? [ticket.originId]
    : { status: 'skipped', detail: `The ticket was not imported from ${label}` };
}

/** Does the action on its items through the tracker's adapter; says why when it cannot. */
function deliver(
  db: Db,
  apis: IntegrationApis,
  due: Due,
  action: TrackerAction,
): Promise<DeliveryOutcome> {
  const { delivery, rule, event } = due;
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const itemIds = itemsOf(db, due, ticket, action.tracker);
  if (!Array.isArray(itemIds)) {
    return Promise.resolve(itemIds);
  }
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  const integration = integrationOf(db, rule.projectId, action.tracker);
  const { rules } = trackerAdapter(action.tracker, apis);
  if (!project || !integration || !rules) {
    const { label } = integrationKind(action.tracker);
    return Promise.resolve({ status: 'failed', error: `The project is not connected to ${label}` });
  }
  const access = {
    secret: integration.secret,
    config: integration.config,
    fields: integration.fields,
  };
  return rules.deliver(access, {
    itemIds,
    action,
    values: templateValues(project, ticket, event),
  });
}

/** Deliveries per tick at most: the tracker's pace (each tracker's actions are counted apart). */
function perTick(apis: IntegrationApis, action: TrackerAction): number {
  return trackerAdapter(action.tracker, apis).rules?.perTick ?? 1;
}

export function trackerTargets(db: Db, apis: IntegrationApis): Pick<ActionTargets, TrackerKind> {
  const target = {
    perTick: (action: TrackerAction) => perTick(apis, action),
    deliver: (due: Due, action: TrackerAction) => deliver(db, apis, due, action),
  };
  return { tracker_status: target, tracker_fields: target, tracker_comment: target };
}
