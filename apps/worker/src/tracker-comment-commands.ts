// The commands that post a comment on a ticket's tracker item, and those queued before them (read for one release).
import {
  legacyJiraComment,
  legacyNotionComment,
  POST_TRACKER_COMMENT,
  trackerCommentOf,
  type TrackerCommentPost,
} from '@union/core';

import type { CommandHooks } from './command-hooks';

/** How each command type reads its payload as a tracker comment. */
const READERS: Record<string, (payload: unknown) => TrackerCommentPost> = {
  [POST_TRACKER_COMMENT]: trackerCommentOf,
  post_notion_comment: legacyNotionComment,
  post_jira_comment: legacyJiraComment,
};

type CommentHandler = (
  db: unknown,
  command: { id: number; payload: unknown },
  hooks: CommandHooks,
) => void;

/** One handler per command type, each handing the comment to `postTrackerComment`. */
export const TRACKER_COMMENT_COMMANDS: Record<string, CommentHandler> = Object.fromEntries(
  Object.entries(READERS).map(([type, read]): [string, CommentHandler] => [
    type,
    (_db, command, hooks) => {
      hooks.postTrackerComment(command.id, read(command.payload));
    },
  ]),
);
