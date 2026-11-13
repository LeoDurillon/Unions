// One property of a tracker item set by hand, as the web queues it (`set_tracker_fields`) and the worker reads it.
// Browser-safe.
// The value is written as a rule's value is, without variables, so the rules' shaping sends it.

import { isRecord } from '../agent/agent-activity';
import { notionPropertyValue } from '../event/event-rule-types';
import { isIntegrationKindName, type IntegrationKindName } from './kinds';

export const SET_TRACKER_FIELDS = 'set_tracker_fields';

/** What a pick of a Jira list is: its id, and its name for the text. */
type ItemPick = { id: string; name: string };

/** The field as the tab read it: its id, name, type, and a choice's options. */
type FieldRef = { id: string; name: string; type: string; options: string[] };

/**
 * The payload of a `set_tracker_fields` command: one field of the item `itemId` (a Notion page's id,
 * a Jira issue's key), set from a ticket's tab (`ticketId`) or a review's (`reviewId`). `text` is
 * the value as the user reads it (names, not ids), for "Saving…" and the event.
 */
export type TrackerFieldSet = {
  projectId: number;
  kind: IntegrationKindName;
  itemId: string;
  ticketId: number | null;
  reviewId: number | null;
  field: FieldRef;
  value: string;
  text: string;
  picks: ItemPick[];
};

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function idOrNull(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function fieldOf(value: unknown): FieldRef | null {
  const record = isRecord(value) ? value : {};
  const id = nonEmpty(record.id);
  const type = nonEmpty(record.type);
  if (id === null || type === null) {
    return null;
  }
  return { id, name: nonEmpty(record.name) ?? id, type, options: strings(record.options) };
}

function picksOf(value: unknown): ItemPick[] {
  const list: unknown[] = Array.isArray(value) ? value : [];
  return list.flatMap((pick) => {
    const record = isRecord(pick) ? pick : {};
    const id = nonEmpty(record.id);
    return id === null ? [] : [{ id, name: nonEmpty(record.name) ?? id }];
  });
}

/** Where the change was made, or null when the payload names neither a ticket nor a review. */
function placeOf(
  record: Record<string, unknown>,
): Pick<TrackerFieldSet, 'ticketId' | 'reviewId'> | null {
  const ticketId = idOrNull(record.ticketId);
  const reviewId = idOrNull(record.reviewId);
  return ticketId === null && reviewId === null ? null : { ticketId, reviewId };
}

/** The change a `set_tracker_fields` command carries; throws when the payload is not one. */
export function trackerFieldSetOf(payload: unknown): TrackerFieldSet {
  const record = isRecord(payload) ? payload : {};
  const projectId = idOrNull(record.projectId);
  const kind =
    typeof record.kind === 'string' && isIntegrationKindName(record.kind) ? record.kind : null;
  const itemId = nonEmpty(record.itemId);
  const field = fieldOf(record.field);
  const place = placeOf(record);
  if (projectId === null || kind === null || itemId === null || field === null || place === null) {
    throw new TypeError(
      `${SET_TRACKER_FIELDS} needs a "projectId", a "kind", an "itemId", a "field" and a ticket or a review`,
    );
  }
  const value = typeof record.value === 'string' ? record.value.trim() : '';
  return {
    projectId,
    kind,
    itemId,
    ...place,
    field,
    value,
    text: typeof record.text === 'string' ? record.text : value,
    picks: picksOf(record.picks),
  };
}

/**
 * A value typed by hand for a Notion property, as Notion takes it, or why it cannot be one. A status
 * is checked against the stored options when Union has them; else Notion checks it.
 */
export function notionHandValue(
  field: { type: string; options: string[] },
  value: string,
): { value: unknown } | { error: string } {
  const options = field.options.length > 0 ? field.options : [value];
  return notionPropertyValue({ type: field.type, options }, value);
}
