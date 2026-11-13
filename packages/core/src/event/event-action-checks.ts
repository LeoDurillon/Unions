// A rule's action as sent by the settings page, checked: GitHub's and Union's here, a tracker's by its tracker.

import type { Db } from '../db';
import { integrationKind, isIntegrationKindName } from '../integrations/kinds';
import { integrationOf } from '../integrations/store';
import type { TrackerActionKind } from '../integrations/tracker-action-kinds';
import { trackerRuleChecks } from '../integrations/tracker-rules';
import {
  checkGitHubComment,
  checkGitHubProjectFields,
  checkGitHubPullRequest,
  checkUnionNotification,
  isActionKind,
  isTrackerActionKind,
  type ActionKind,
  type ActionOf,
  type EventAction,
} from './event-actions';
import { legacyTrackerAction } from './event-legacy-actions';
import { EventRuleError } from './event-rule-error';

type OwnChecks = {
  [K in Exclude<ActionKind, TrackerActionKind>]: (record: object) => ActionOf<K>;
};

/** A check's result as the save sees it: the action, or the reason thrown. */
function thrown<A>(checked: { action: A } | { error: string }): A {
  if ('error' in checked) {
    throw new EventRuleError(checked.error);
  }
  return checked.action;
}

/** The checks of the kinds acting on GitHub and Union; a tracker's are its own (`tracker-rules.ts`). */
const OWN_CHECKS: OwnChecks = {
  github_comment: (record) => thrown(checkGitHubComment(record)),
  github_pull_request: (record) => thrown(checkGitHubPullRequest(record)),
  github_project_fields: (record) => thrown(checkGitHubProjectFields(record)),
  union_notification: (record) => thrown(checkUnionNotification(record)),
};

/** A tracker action, checked by its tracker against the columns the project's integration last read. */
function checkedTrackerAction(
  db: Db,
  projectId: number,
  record: object,
  target: { tracker: unknown; kind: TrackerActionKind },
): EventAction {
  const { tracker, kind } = target;
  if (
    typeof tracker !== 'string' ||
    !isIntegrationKindName(tracker) ||
    !integrationKind(tracker).ruleActions.includes(kind)
  ) {
    throw new EventRuleError('Pick what the rule does');
  }
  const integration = integrationOf(db, projectId, tracker);
  if (!integration) {
    const { label } = integrationKind(tracker);
    throw new EventRuleError(
      `Connect the project to ${label} first (Settings → Integrations → ${label})`,
    );
  }
  const stored = integration.fieldsReadAt === null ? null : integration.fields;
  return trackerRuleChecks(tracker).check(stored, kind, record);
}

/** The action as it would be saved; throws `EventRuleError` with the reason. */
export function checkedAction(db: Db, projectId: number, action: unknown): EventAction {
  const record = typeof action === 'object' && action !== null ? action : {};
  const kind = 'kind' in record ? record.kind : undefined;
  const legacy = legacyTrackerAction(kind);
  if (legacy) {
    return checkedTrackerAction(db, projectId, record, legacy);
  }
  if (!isActionKind(kind)) {
    throw new EventRuleError('Pick what the rule does');
  }
  if (isTrackerActionKind(kind)) {
    const tracker = 'tracker' in record ? record.tracker : undefined;
    return checkedTrackerAction(db, projectId, record, { tracker, kind });
  }
  return OWN_CHECKS[kind](record);
}
