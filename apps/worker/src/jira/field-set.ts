// Sets one field of a Jira issue typed by hand in a tracker tab, or moves its status, and logs how it went.
import {
  JiraError,
  jiraAuthOf,
  jiraHandChange,
  resolveSprint,
  type Db,
  type JiraApi,
  type JiraAuth,
  type TrackerFieldSet,
} from '@union/core';

import { logFieldOutcome } from '../tracker-field-outcome';

const FORBIDDEN = 403;

/** Jira's reason, with the permission named when it refused one. */
function reasonOf(error: unknown, status: boolean): string {
  if (error instanceof JiraError && error.status === FORBIDDEN) {
    const permission = status ? 'Transition issues' : 'Edit issues';
    return `Jira refused it: the account needs the "${permission}" permission in the project`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** `ABC-12` → `ABC`: the project whose board has the sprints. */
function projectKeyOf(issueKey: string): string {
  return issueKey.slice(0, issueKey.lastIndexOf('-'));
}

/** Sends the field, or why Jira cannot take it; "the active sprint" is the board's now. */
async function sendField(
  jira: JiraApi,
  auth: JiraAuth,
  change: TrackerFieldSet,
): Promise<string | null> {
  const picks =
    change.field.type === 'sprint'
      ? await Promise.all(
          change.picks.map((pick) => resolveSprint(jira, auth, projectKeyOf(change.itemId), pick)),
        )
      : change.picks;
  const shaped = jiraHandChange(change.field, change.value, picks);
  if ('error' in shaped) {
    return shaped.error;
  }
  await jira.updateIssue(auth, change.itemId, { fields: shaped.fields, update: {} });
  return null;
}

async function attempt(db: Db, jira: JiraApi, change: TrackerFieldSet): Promise<string | null> {
  const auth = jiraAuthOf(db, change.projectId);
  if (!auth) {
    return 'This project is not connected to Jira';
  }
  const status = change.field.id === 'status';
  try {
    if (!status) {
      return await sendField(jira, auth, change);
    }
    const [transition] = change.picks;
    if (!transition) {
      return 'Pick where to move the issue';
    }
    await jira.transitionIssue(auth, change.itemId, transition.id);
    return null;
  } catch (error) {
    return reasonOf(error, status);
  }
}

/**
 * Sets the field of the `set_tracker_fields` command `commandId` with the project's Jira account, or
 * moves the issue with the picked transition; `tracker_field_set` or `tracker_field_failed` says how it went.
 */
export async function setJiraField(
  db: Db,
  jira: JiraApi,
  commandId: number,
  change: TrackerFieldSet,
): Promise<void> {
  logFieldOutcome(db, commandId, change, await attempt(db, jira, change));
}
