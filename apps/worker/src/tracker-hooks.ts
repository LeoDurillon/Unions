// The command hooks that write to the trackers: comments on Notion pages and Jira issues, a property set by hand.
import { FetchNotionApi, type Db, type NotionApi } from '@union/core';

import type { CommandHooks } from './command-hooks';
import { jiraHooks } from './jira/comment-post';
import { notionHooks } from './notion/comment-post';
import { setNotionField } from './notion/field-set';

type TrackerHooks = Pick<CommandHooks, 'postNotionComment' | 'postJiraComment' | 'setTrackerField'>;

export function trackerHooks(db: Db, notion: NotionApi = new FetchNotionApi()): TrackerHooks {
  return {
    ...notionHooks(db, notion),
    ...jiraHooks(db),
    setTrackerField: (commandId, change) => {
      if (change.kind !== 'notion') {
        // The web queues Notion changes only; the command fails with this as its error.
        throw new Error('Jira fields cannot be set from Union yet');
      }
      void setNotionField(db, notion, commandId, change);
    },
  };
}
