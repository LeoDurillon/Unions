// A Jira issue's field set by hand: checked against the issue's edit screen read now, then sent.
// Its status moves with one of the transitions it offers.

import type { JiraApi, JiraAuth } from './jira-api';
import { JiraError } from './jira-error';
import { jiraHandChange } from './jira-hand-value';
import { readJiraIssueFacts } from './jira-issue-facts';
import { resolveSprint } from './jira-picks';
import {
  settableProperty,
  type CheckedField,
  type FieldChange,
  type TrackerFieldInput,
} from './tracker-fields';
import { TrackerValueError } from './tracker-value-error';

const FORBIDDEN = 403;
const STATUS = 'status';

/** `ABC-12` → `ABC`: the project whose board has the sprints. */
function projectKeyOf(issueKey: string): string {
  return issueKey.slice(0, issueKey.lastIndexOf('-'));
}

/** Refused unless the one pick is a transition the issue offers now. */
async function checkTransition(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
  input: TrackerFieldInput,
): Promise<void> {
  const [pick] = input.picks;
  const offered = await jira.transitions(auth, key);
  if (input.picks.length !== 1 || !offered.some((one) => one.id === pick?.id)) {
    throw new TrackerValueError('Pick one of the moves the issue offers now: refresh the tab');
  }
}

/** The field's type is the issue's edit screen's now; the status, a move the issue offers. */
export async function checkJiraField(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
  input: TrackerFieldInput,
): Promise<CheckedField> {
  const facts = await readJiraIssueFacts(jira, auth, key);
  if (!facts) {
    throw new Error('Jira did not give the issue: refresh the tab');
  }
  const property = settableProperty(facts.properties, input, 'Jira');
  if (property.id === STATUS) {
    await checkTransition(jira, auth, key, input);
  } else {
    const change = jiraHandChange(property, input.value, input.picks);
    if ('error' in change) {
      throw new TrackerValueError(change.error);
    }
  }
  const field = {
    id: property.id,
    name: property.name,
    type: property.type,
    options: property.options,
  };
  return { field, value: input.value, picks: input.picks };
}

/** Sends the field, "the active sprint" being the board's now; or moves the issue with the picked transition. */
export async function setJiraField(
  jira: JiraApi,
  auth: JiraAuth,
  change: FieldChange,
): Promise<void> {
  if (change.field.id === STATUS) {
    const [transition] = change.picks;
    if (!transition) {
      throw new TrackerValueError('Pick where to move the issue');
    }
    await jira.transitionIssue(auth, change.itemId, transition.id);
    return;
  }
  const picks =
    change.field.type === 'sprint'
      ? await Promise.all(
          change.picks.map((pick) => resolveSprint(jira, auth, projectKeyOf(change.itemId), pick)),
        )
      : change.picks;
  const shaped = jiraHandChange(change.field, change.value, picks);
  if ('error' in shaped) {
    throw new TrackerValueError(shaped.error);
  }
  await jira.updateIssue(auth, change.itemId, { fields: shaped.fields, update: {} });
}

/** Jira's reason, with the permission named when it refused one. */
export function jiraFieldFailure(error: unknown, fieldId: string): string {
  if (error instanceof JiraError && error.status === FORBIDDEN) {
    const permission = fieldId === STATUS ? 'Transition issues' : 'Edit issues';
    return `Jira refused it: the account needs the "${permission}" permission in the project`;
  }
  return error instanceof Error ? error.message : String(error);
}
