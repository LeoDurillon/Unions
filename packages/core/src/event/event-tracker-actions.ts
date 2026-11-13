// The rule actions on a tracker's item (move it, set its fields, comment on it), each naming its tracker; browser-safe.
// What each tracker takes is its kind's `ruleActions`; its adapter checks, previews and sends them.

import { integrationKind, type IntegrationKindName } from '../integrations/kinds';
import type { TrackerActionKind } from '../integrations/tracker-action-kinds';

/** One thing picked for a field (a person, a version, a sprint): its id, and its name when the rule was saved. */
type TrackerPick = { id: string; name: string };

/**
 * One field a rule sets: its id, and its name and the tracker's type for it as they were when the
 * rule was saved. `value` is a template; a picked field's is the picks' names, for the sentence.
 */
export type TrackerRuleValue = {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  value: string;
  picks?: TrackerPick[];
};

/** What each tracker action holds beside its `kind`. */
export type TrackerActionFields = {
  /** Moves the item to this status (Jira: through whichever transition of its workflow leads there). */
  tracker_status: { tracker: IntegrationKindName; statusId: string; statusName: string };
  /** Sets fields of the item, all in one request. */
  tracker_fields: { tracker: IntegrationKindName; values: TrackerRuleValue[] };
  /** Comments on the item; `body` is a template, sent as plain text. */
  tracker_comment: { tracker: IntegrationKindName; body: string };
};

export type TrackerActionOf<K extends TrackerActionKind> = { kind: K } & TrackerActionFields[K];

export type TrackerAction = { [K in TrackerActionKind]: TrackerActionOf<K> }[TrackerActionKind];

/** "Move the ticket's Jira issue", "Set properties of the ticket's Notion page". */
export function trackerActionLabel(kind: TrackerActionKind, tracker: IntegrationKindName): string {
  const { label, itemLabel, fieldsLabel } = integrationKind(tracker);
  const item = `the ticket's ${label} ${itemLabel}`;
  if (kind === 'tracker_status') {
    return `Move ${item}`;
  }
  if (kind === 'tracker_fields') {
    return `Set ${fieldsLabel} of ${item}`;
  }
  return `Comment on ${item}`;
}

/** A new tracker action, before the user fills it in. */
export function emptyTrackerAction(
  kind: TrackerActionKind,
  tracker: IntegrationKindName,
): TrackerAction {
  if (kind === 'tracker_status') {
    return { kind, tracker, statusId: '', statusName: '' };
  }
  if (kind === 'tracker_fields') {
    return { kind, tracker, values: [{ fieldId: '', fieldName: '', fieldType: '', value: '' }] };
  }
  return { kind, tracker, body: '' };
}
