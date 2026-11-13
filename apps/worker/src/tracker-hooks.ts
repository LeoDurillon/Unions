// The command hooks that write to the trackers: a comment on a ticket's item, a property set by hand.
import { FetchJiraApi, FetchNotionApi, type Db, type JiraApi, type NotionApi } from '@union/core';

import type { CommandHooks } from './command-hooks';
import { setJiraField } from './jira/field-set';
import { setNotionField } from './notion/field-set';
import { postTrackerComment } from './tracker-comment-post';

type TrackerHooks = Pick<CommandHooks, 'postTrackerComment' | 'setTrackerField'>;

export function trackerHooks(
  db: Db,
  notion: NotionApi = new FetchNotionApi(),
  jira: JiraApi = new FetchJiraApi(),
): TrackerHooks {
  return {
    postTrackerComment: (commandId, post) => {
      void postTrackerComment(db, { notion, jira }, commandId, post);
    },
    setTrackerField: (commandId, change) => {
      void (change.kind === 'jira'
        ? setJiraField(db, jira, commandId, change)
        : setNotionField(db, notion, commandId, change));
    },
  };
}
