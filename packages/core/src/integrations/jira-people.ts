// The people a Jira comment can tag: the accounts that can see the issue whose name matches what was typed.

import type { JiraApi, JiraAuth } from './jira-api';
import { isRecord, text } from './jira-parse';
import type { TrackerPerson } from './tracker-mention';

/** More would not fit the list under the comment box. */
const MAX_PEOPLE = 10;

/** People only: an app's account (`app`) or a customer's cannot be notified. */
function personOf(user: unknown): TrackerPerson[] {
  if (!isRecord(user) || user.accountType !== 'atlassian' || user.active === false) {
    return [];
  }
  const id = text(user, 'accountId');
  return id === '' ? [] : [{ id, name: text(user, 'displayName') || id }];
}

/** Those who can see the issue `key` and whose name or email starts with `query`, as Jira finds them. */
export async function jiraPeople(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
  query: string,
): Promise<TrackerPerson[]> {
  const search = new URLSearchParams({
    issueKey: key,
    query: query.trim(),
    maxResults: String(MAX_PEOPLE),
  });
  const users = await jira.read(auth, `/user/viewissue/search?${search.toString()}`);
  return Array.isArray(users) ? users.flatMap((user) => personOf(user)) : [];
}
