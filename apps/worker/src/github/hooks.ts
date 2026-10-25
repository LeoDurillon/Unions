// The commands' hooks that write to GitHub: a review posted, a description sent, an issue edited, a job run again, a comment replied to.
import type { Db, Project } from '@union/core';

import type { CommandHooks } from '../command-hooks';
import type { GitHubApi } from './api';
import { rerunCiJob } from './ci-rerun';
import { replyToPrComment } from './pr-comment-reply';
import { sendPrDescription } from './pr-description-send';
import { postPullRequestReview } from './pr-review';
import { editTicket } from './ticket-edit';

type GitHubHooks = Pick<
  CommandHooks,
  'submitPullRequestReview' | 'sendPrDescription' | 'editTicket' | 'rerunCiJob' | 'replyToPrComment'
>;

/** The hooks that write to GitHub with the project's credentials, each in the background. */
export function gitHubHooks(db: Db, apiFor: (project: Project) => GitHubApi | null): GitHubHooks {
  return {
    submitPullRequestReview: (reviewId, submitted) => {
      void postPullRequestReview(db, apiFor, reviewId, submitted);
    },
    sendPrDescription: (id) => {
      void sendPrDescription(db, apiFor, id);
    },
    editTicket: (ticketId, edit) => {
      void editTicket(db, apiFor, ticketId, edit);
    },
    rerunCiJob: (ticketId, job) => {
      void rerunCiJob(db, apiFor, ticketId, job);
    },
    replyToPrComment: (commandId, reply) => {
      void replyToPrComment(db, apiFor, commandId, reply);
    },
  };
}
