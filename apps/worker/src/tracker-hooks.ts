// The command hooks that write to the trackers: comments on Notion pages and Jira issues, a property set by hand.
import { FetchJiraApi, FetchNotionApi, type Db, type JiraApi, type NotionApi } from '@union/core';

import type { CommandHooks } from './command-hooks';
import { jiraHooks } from './jira/comment-post';
import { setJiraField } from './jira/field-set';
import { notionHooks } from './notion/comment-post';
import { setNotionField } from './notion/field-set';

type TrackerHooks = Pick<CommandHooks, 'postNotionComment' | 'postJiraComment' | 'setTrackerField'>;

export function trackerHooks(
  db: Db,
  notion: NotionApi = new FetchNotionApi(),
  jira: JiraApi = new FetchJiraApi(),
): TrackerHooks {
  return {
    ...notionHooks(db, notion),
    ...jiraHooks(db, jira),
    setTrackerField: (commandId, change) => {
      void (change.kind === 'jira'
        ? setJiraField(db, jira, commandId, change)
        : setNotionField(db, notion, commandId, change));
    },
  };
}
