// A Jira issue's field set by hand: the issue read now, the value checked as the worker will send it, then queued.
// The status is moved with one of the transitions the issue offers now.

import {
  jiraHandChange,
  readJiraIssueFacts,
  type Db,
  type JiraApi,
  type JiraAuth,
  type TrackerProperty,
} from '@union/core';

import { BAD_GATEWAY, BAD_REQUEST, fail } from './http';
import { guarded } from './routes/notion';
import { queueTrackerField } from './tracker-field-commands';
import {
  settableProperty,
  type TrackerFieldInput,
  type TrackerFieldTarget,
} from './tracker-field-input';

/** Refused unless the one pick is a transition the issue offers now. */
async function checkTransition(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
  input: TrackerFieldInput,
): Promise<void> {
  const [pick] = input.picks;
  const offered = await guarded(() => jira.transitions(auth, key));
  if (input.picks.length !== 1 || !offered.some((one) => one.id === pick?.id)) {
    throw fail(BAD_REQUEST, 'Pick one of the moves the issue offers now: refresh the tab');
  }
}

type Issue = { jira: JiraApi; auth: JiraAuth; key: string };

async function check(
  { jira, auth, key }: Issue,
  property: TrackerProperty,
  input: TrackerFieldInput,
): Promise<void> {
  if (property.id === 'status') {
    await checkTransition(jira, auth, key, input);
    return;
  }
  const change = jiraHandChange(property, input.value, input.picks);
  if ('error' in change) {
    throw fail(BAD_REQUEST, change.error);
  }
}

/** Queues the change; the field's type is the issue's edit screen's now. */
export async function queueJiraField(
  db: Db,
  jira: JiraApi,
  { auth, target }: { auth: JiraAuth; target: TrackerFieldTarget },
  input: TrackerFieldInput,
): Promise<number> {
  const facts = await readJiraIssueFacts(jira, auth, target.itemId);
  if (!facts) {
    throw fail(BAD_GATEWAY, 'Jira did not give the issue: refresh the tab');
  }
  const property = settableProperty(facts.properties, input, 'Jira');
  await check({ jira, auth, key: target.itemId }, property, input);
  return queueTrackerField(db, {
    projectId: target.projectId,
    kind: 'jira',
    itemId: target.itemId,
    ...target.place,
    field: { id: property.id, name: property.name, type: property.type, options: property.options },
    value: input.value,
    text: input.text,
    picks: input.picks,
  });
}
