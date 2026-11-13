// Posts a comment on a ticket's tracker item through its adapter, and logs how it went.
// `tracker_comment_posted`, or `tracker_comment_failed` with the tracker's reason, on the ticket.

import {
  emitEvent,
  integrationKind,
  integrationOf,
  trackerAdapter,
  type Db,
  type IntegrationApis,
  type TrackerCommentPost,
} from '@union/core';

type Outcome = { commentId: string } | { error: string };

async function attempt(db: Db, apis: IntegrationApis, post: TrackerCommentPost): Promise<Outcome> {
  const integration = integrationOf(db, post.projectId, post.kind);
  const { comments } = trackerAdapter(post.kind, apis);
  if (!integration) {
    return { error: `This project is not connected to ${integrationKind(post.kind).label}` };
  }
  if (!comments) {
    return { error: `Union cannot comment on ${integrationKind(post.kind).label}` };
  }
  try {
    return await comments.post(integration.secret, integration.config, post);
  } catch (error) {
    return { error: comments.postFailure(error, post.threadId !== null) };
  }
}

/** Posts the comment of the command `commandId` with the project's secret for its tracker. */
export async function postTrackerComment(
  db: Db,
  apis: IntegrationApis,
  commandId: number,
  post: TrackerCommentPost,
): Promise<void> {
  const outcome = await attempt(db, apis, post);
  const { kind, threadId } = post;
  emitEvent(
    db,
    'error' in outcome
      ? {
          type: 'tracker_comment_failed',
          ticketId: post.ticketId,
          payload: { commandId, kind, threadId, text: post.text, error: outcome.error },
        }
      : {
          type: 'tracker_comment_posted',
          ticketId: post.ticketId,
          payload: { commandId, kind, threadId, commentId: outcome.commentId },
        },
  );
}
