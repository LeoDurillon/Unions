// What the commands hand off to the running worker (all asynchronous), and the no-op set for tests and tools.
import type { PrCommentReply, ReviewVerdict, WorkspaceOwner } from '@union/core';

import type { CiJob } from './github/ci-rerun';
import type { TicketEdit } from './github/ticket-edit';

export type ContainerRef = { name: string; home: string; workspace: string };

/** Side effects some commands hand off (they are asynchronous; draining stays synchronous). */
export type CommandHooks = {
  removeContainers: (containers: ContainerRef[]) => void;
  /** Stops a running investigation. */
  cancelInvestigation: (id: number) => void;
  /** Stops a running agent review. */
  cancelAgentReview: (id: number) => void;
  /** Stops a running grouping of a review by spec. */
  cancelReviewGrouping: (id: number) => void;
  /** Stops a running explanation of a review's lines. */
  cancelReviewExplanation: (id: number) => void;
  /** Stops a running spec report of a review. */
  cancelReviewReport: (id: number) => void;
  /** Posts a current review's drafts and summary on its pull request, with the user's verdict. */
  submitPullRequestReview: (
    reviewId: number,
    submitted: { summary: string; verdict: ReviewVerdict },
  ) => void;
  /** Stops a running rewrite of a PR description. */
  cancelPrDescription: (id: number) => void;
  /** Stops a command running in a ticket's workspace. */
  cancelContainerRun: (id: number) => void;
  /** Writes a rewritten PR description, as the user left it, to GitHub. */
  sendPrDescription: (id: number) => void;
  /** Writes the title and description the user edited to the ticket's issue, then to the ticket. */
  editTicket: (ticketId: number, edit: TicketEdit) => void;
  /** Asks GitHub to run a failed Actions job of the ticket's pull request again. */
  rerunCiJob: (ticketId: number, job: CiJob) => void;
  /** Posts a reply to a pull request comment; `commandId` ties its event to the command. */
  replyToPrComment: (commandId: number, reply: PrCommentReply) => void;
  /**
   * Starts, stops, reads the logs of, or generates the compose file of a ticket's or a pull
   * request's preview; `update` moves a pull request's checkout to the commit its review reads.
   */
  preview: (owner: WorkspaceOwner, action: PreviewAction) => void;
  /** Fetches Union's own remote and records how far behind the checkout is. */
  checkUnionUpdate: () => void;
  /** Pulls Union's new commits and restarts it; `force` even while work is in progress. */
  updateUnion: (force: boolean) => void;
};

export type PreviewAction = 'start' | 'stop' | 'logs' | 'generate' | 'e2e' | 'update';

function ignore(): void {
  // Without hooks (tests, tools), container removal and run cancellation are skipped.
}

export const NO_HOOKS: CommandHooks = {
  removeContainers: ignore,
  cancelInvestigation: ignore,
  cancelAgentReview: ignore,
  cancelReviewGrouping: ignore,
  cancelReviewExplanation: ignore,
  cancelReviewReport: ignore,
  submitPullRequestReview: ignore,
  cancelPrDescription: ignore,
  cancelContainerRun: ignore,
  sendPrDescription: ignore,
  editTicket: ignore,
  rerunCiJob: ignore,
  replyToPrComment: ignore,
  preview: ignore,
  checkUnionUpdate: ignore,
  updateUnion: ignore,
};
