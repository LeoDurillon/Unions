// Posts a comment on a ticket's Notion page (a reply in a discussion, or a new page comment) and logs how it went.
import {
  emitEvent,
  FetchNotionApi,
  integrationOf,
  NotionError,
  toRichText,
  type Db,
  type NotionApi,
  type NotionCommentPost,
} from '@union/core';

import type { CommandHooks } from '../command-hooks';

const FORBIDDEN = 403;
const NOT_FOUND = 404;

type Outcome = { discussionId: string; commentId: string } | { error: string };

/** Notion's reason, with the capability named when it refused one. */
function reasonOf(error: unknown, post: NotionCommentPost): string {
  if (error instanceof NotionError && error.status === FORBIDDEN) {
    return 'Notion refused it: in the integration’s settings, Capabilities, turn on “Insert comments”';
  }
  if (error instanceof NotionError && error.status === NOT_FOUND && post.discussionId !== null) {
    return 'Notion did not find the discussion: it may have been resolved or deleted';
  }
  return error instanceof Error ? error.message : String(error);
}

async function attempt(db: Db, notion: NotionApi, post: NotionCommentPost): Promise<Outcome> {
  const integration = integrationOf(db, post.projectId, 'notion');
  if (!integration) {
    return { error: 'This project is not connected to Notion' };
  }
  const target =
    post.discussionId === null ? { pageId: post.pageId } : { discussionId: post.discussionId };
  try {
    const comment = await notion.addComment(integration.secret, target, toRichText(post.text));
    return { discussionId: comment.discussionId, commentId: comment.id };
  } catch (error) {
    return { error: reasonOf(error, post) };
  }
}

/**
 * Posts the comment of the `post_notion_comment` command `commandId` with the project's Notion
 * secret; `notion_comment_posted` or `notion_comment_failed` on the ticket says how it went.
 */
export async function postNotionComment(
  db: Db,
  notion: NotionApi,
  commandId: number,
  post: NotionCommentPost,
): Promise<void> {
  const outcome = await attempt(db, notion, post);
  emitEvent(
    db,
    'error' in outcome
      ? {
          type: 'notion_comment_failed',
          ticketId: post.ticketId,
          payload: {
            commandId,
            discussionId: post.discussionId,
            text: post.text,
            error: outcome.error,
          },
        }
      : {
          type: 'notion_comment_posted',
          ticketId: post.ticketId,
          payload: { commandId, ...outcome },
        },
  );
}

/** The hooks that write to Notion with the project's secret, in the background. */
export function notionHooks(
  db: Db,
  notion: NotionApi = new FetchNotionApi(),
): Pick<CommandHooks, 'postNotionComment'> {
  return {
    postNotionComment: (commandId, post) => {
      void postNotionComment(db, notion, commandId, post);
    },
  };
}
