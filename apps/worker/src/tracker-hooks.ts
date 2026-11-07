// The command hooks that write to the trackers a project is connected to: comments on Notion pages and Jira issues.
import type { Db } from '@union/core';

import type { CommandHooks } from './command-hooks';
import { jiraHooks } from './jira/comment-post';
import { notionHooks } from './notion/comment-post';

export function trackerHooks(db: Db): Pick<CommandHooks, 'postNotionComment' | 'postJiraComment'> {
  return { ...notionHooks(db), ...jiraHooks(db) };
}
