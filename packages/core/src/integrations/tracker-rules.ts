// The rule actions a tracker takes: checked when saved and previewed (pure, from its stored columns), then sent.
// `trackerRuleChecks` needs no API client, so saving a rule calls no tracker; the adapter's `rules` sends.

import type { DeliveryOutcome } from '../event/delivery-outcome';
import type { TemplateVariable } from '../event/event-rule-types';
import type { TrackerAction } from '../event/event-tracker-actions';
import { checkJiraRule } from './jira-rule-check';
import { previewJiraRule } from './jira-rule-preview';
import type { IntegrationKindName } from './kinds';
import { checkNotionRule, previewNotionRule } from './notion-rule-check';
import type { TrackerActionKind } from './tracker-action-kinds';
import type { TrackerAccess } from './tracker-fields';

/** The rule's variables filled in for one ticket and event. */
export type RuleValues = Partial<Record<TemplateVariable, string>>;

/** What the preview says the action would do: a title, its fields (`lines`) or comment (`text`), and a note. */
export type RulePreviewText = {
  title: string;
  lines: string[];
  text: string | null;
  /** What only the run can check (the workflow, the options): said under the preview. */
  note: string | null;
};

/** `stored`: the columns the integration last read (`integrations.fields`). */
export type TrackerRuleChecks = {
  /** The action as sent by the settings page, checked; throws `EventRuleError` with the reason. */
  check(stored: unknown, kind: TrackerActionKind, record: object): TrackerAction;
  /** What the action would do on the item; nothing is sent. */
  preview(
    stored: unknown,
    action: TrackerAction,
    itemId: string,
    values: RuleValues,
  ): RulePreviewText | { error: string };
};

/** One delivery of an action: the items it acts on, and the rule's variables filled in for its event. */
export type RuleRun = { itemIds: readonly string[]; action: TrackerAction; values: RuleValues };

/** The adapter's `rules` capability: the checks, and the sending. */
export type TrackerRules = TrackerRuleChecks & {
  /** Deliveries per tick at most: the pace the tracker's API allows. */
  perTick: number;
  /** Does the action on each item in turn; the first that does not succeed is the outcome. */
  deliver(access: TrackerAccess, run: RuleRun): Promise<DeliveryOutcome>;
};

const CHECKS: Record<IntegrationKindName, TrackerRuleChecks> = {
  notion: {
    check: checkNotionRule,
    preview: (stored, action, _pageId, values) => previewNotionRule(stored, action, values),
  },
  jira: {
    check: checkJiraRule,
    preview: (_stored, action, key, values) => previewJiraRule(action, key, values),
  },
};

export function trackerRuleChecks(kind: IntegrationKindName): TrackerRuleChecks {
  return CHECKS[kind];
}
