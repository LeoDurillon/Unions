// The rule action kinds before tracker actions (`notion_property`, `jira_*`), read as the tracker action each became.
// A browser loaded before the deploy still sends them; migration 0091 rewrote the saved ones. Drop after a release.

import type { IntegrationKindName } from '../integrations/kinds';
import type { TrackerActionKind } from '../integrations/tracker-action-kinds';

const LEGACY: Record<string, { tracker: IntegrationKindName; kind: TrackerActionKind }> = {
  notion_property: { tracker: 'notion', kind: 'tracker_fields' },
  jira_transition: { tracker: 'jira', kind: 'tracker_status' },
  jira_field: { tracker: 'jira', kind: 'tracker_fields' },
  jira_comment: { tracker: 'jira', kind: 'tracker_comment' },
};

/** The tracker action an old kind is; an action without a kind is a Notion one, as the oldest rules were. */
export function legacyTrackerAction(
  kind: unknown,
): { tracker: IntegrationKindName; kind: TrackerActionKind } | null {
  if (kind === undefined) {
    return LEGACY.notion_property ?? null;
  }
  return typeof kind === 'string' && Object.hasOwn(LEGACY, kind) ? (LEGACY[kind] ?? null) : null;
}
