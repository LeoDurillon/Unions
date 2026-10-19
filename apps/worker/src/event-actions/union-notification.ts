// The "Notify me in Union" action of a rule: a notification in the bell (and on the desktop, when on) about the ticket.
import {
  clipDetail,
  getTicket,
  renderTemplate,
  schema,
  templateValues,
  type Db,
  type DeliveryOutcome,
  type UnionNotificationAction,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { recordNotification } from '../notifier';
import { noTicket, type ActionTarget, type Due } from './target';

/** Nothing outside is called: a tick can write many. */
const PER_TICK = 50;

function deliver(
  db: Db,
  { delivery, rule, event }: Due,
  action: UnionNotificationAction,
): DeliveryOutcome {
  const ticket = delivery.ticketId === null ? null : getTicket(db, delivery.ticketId);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, rule.projectId))
    .get();
  if (!ticket || !project) {
    return noTicket(delivery);
  }
  const message = clipDetail(
    renderTemplate(action.message, templateValues(project, ticket, event)),
  );
  if (message === '') {
    return {
      status: 'skipped',
      detail: 'The notification is empty once its variables are filled in',
    };
  }
  const values = {
    projectId: project.id,
    ticketId: ticket.id,
    kind: 'rule',
    ruleId: rule.id,
    title: ticket.title,
    detail: message,
    eventSeq: event.seq,
  } as const;
  return recordNotification(db, values)
    ? { status: 'succeeded', detail: `Notified: ${message}` }
    : { status: 'skipped', detail: 'Already notified for this event' };
}

export function unionNotificationTarget(db: Db): ActionTarget<'union_notification'> {
  return { perTick: PER_TICK, deliver: (due, action) => Promise.resolve(deliver(db, due, action)) };
}
