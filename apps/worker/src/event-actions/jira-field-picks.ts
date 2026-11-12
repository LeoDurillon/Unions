// The picked values of a Jira fields rule (a person, versions, components, a sprint) as Jira takes
// them. "The active sprint" and "the next sprint" are read from the project's board when the rule
// runs.
import {
  jiraPickedValue,
  resolveSprint,
  type JiraApi,
  type JiraFieldAction,
  type JiraPickedType,
} from '@union/core';

import type { JiraIssueTarget } from './jira-target';

type Entry = JiraFieldAction['values'][number];
type PickedEntry = Entry & { fieldType: JiraPickedType };

/** `ABC-12` → `ABC`: the project whose board has the sprints. */
function projectKeyOf(issueKey: string): string {
  return issueKey.slice(0, issueKey.lastIndexOf('-'));
}

/** What the rule picked, sprints resolved, as Jira takes it and as the delivery says it. */
export async function pickedValue(
  jira: JiraApi,
  target: JiraIssueTarget,
  entry: PickedEntry,
): Promise<{ text: string; value: { set: unknown } }> {
  const stored = entry.picks ?? [];
  const picks =
    entry.fieldType === 'sprint'
      ? await Promise.all(
          stored.map((pick) => resolveSprint(jira, target.auth, projectKeyOf(target.key), pick)),
        )
      : stored;
  return {
    text: picks.map((pick) => pick.name || pick.id).join(', '),
    value: jiraPickedValue(
      entry.fieldType,
      picks.map((pick) => pick.id),
    ),
  };
}
