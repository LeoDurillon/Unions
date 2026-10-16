// Which events of the log notify the user, and with what text; pure, the worker writes the rows.
import { isEvent, type StoredEvent } from './event-catalog';
import type { notifications } from './schema-notifications';
import { STEP_TITLES, type Phase } from './states';

export type Notification = typeof notifications.$inferSelect;
export type NotificationKind = Notification['kind'];

/** What a notification says; the writer adds where it belongs. */
export type NotificationDraft = Pick<Notification, 'kind' | 'title' | 'detail'>;

/** An error message can be a whole log: the panel shows its start. */
const MAX_DETAIL = 300;

function clip(text: string): string {
  const line = text.trim();
  return line.length > MAX_DETAIL ? `${line.slice(0, MAX_DETAIL - 1)}…` : line;
}

type Moment = { kind: NotificationKind; detail: string };

function phaseMoment(to: Phase): Moment | null {
  if (to.kind === 'awaiting_approval') {
    return { kind: to.kind, detail: `${STEP_TITLES[to.step]} waits for your approval.` };
  }
  if (to.kind === 'failed') {
    return { kind: to.kind, detail: `${STEP_TITLES[to.step]} failed: ${to.error}` };
  }
  if (to.kind === 'commit_refused') {
    return {
      kind: to.kind,
      detail: `The repository's hook refused the commit of ${STEP_TITLES[to.step]}: decide what to do with the changes.`,
    };
  }
  if (to.kind === 'rate_limited') {
    return { kind: to.kind, detail: `${STEP_TITLES[to.step]} is paused by the usage limit.` };
  }
  return null;
}

function investigationMoment(status: 'succeeded' | 'failed' | 'cancelled'): Moment | null {
  if (status === 'succeeded') {
    return { kind: 'investigation_finished', detail: 'The investigation has its answer.' };
  }
  // A cancelled one was stopped by the user, who knows.
  return status === 'failed'
    ? { kind: 'investigation_failed', detail: 'The investigation failed.' }
    : null;
}

function momentOf(event: StoredEvent): Moment | null {
  if (isEvent(event, 'phase_changed')) {
    return phaseMoment(event.payload.to);
  }
  if (isEvent(event, 'start_blocked')) {
    return {
      kind: 'start_blocked',
      detail: `Cannot start before ${event.payload.parent} is done.`,
    };
  }
  if (isEvent(event, 'pull_request_merged')) {
    return { kind: 'pull_request_merged', detail: `#${event.payload.number} was merged.` };
  }
  if (isEvent(event, 'pull_request_closed')) {
    return {
      kind: 'pull_request_closed',
      detail: `#${event.payload.number} was closed without merging.`,
    };
  }
  if (isEvent(event, 'investigation_finished')) {
    return investigationMoment(event.payload.status);
  }
  if (isEvent(event, 'event_rule_applied') && event.payload.status === 'failed') {
    return {
      kind: 'rule_failed',
      detail: `An event rule failed: ${event.payload.error ?? 'no reason given'}`,
    };
  }
  return null;
}

/**
 * The notification `event` makes about `subject` (its ticket or investigation), or null when the
 * event is routine: a step starting, a sync, a rule that succeeded.
 */
export function notificationFor(
  event: StoredEvent,
  subject: { title: string },
): NotificationDraft | null {
  const moment = momentOf(event);
  return moment ? { kind: moment.kind, title: subject.title, detail: clip(moment.detail) } : null;
}
