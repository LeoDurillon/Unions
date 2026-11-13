// What the ticket's Jira tab reads: the issue and its comments, read from Jira now, and those still being sent.
import type { JiraComment, JiraIssueFacts } from '@union/core';

/** A comment queued for the worker; `replyTo` is the comment it answers, null for a new one. */
export type PendingJiraComment = {
  commandId: number;
  replyTo: string | null;
  text: string;
  createdAt: number;
};

/** `total`: how many comments the issue has, more than `comments` when the oldest are left out. */
export type JiraTabView = {
  key: string;
  issueUrl: string;
  /** Null when the issue could not be read; the comments still show. */
  issue: JiraIssueFacts | null;
  comments: JiraComment[];
  total: number;
  pending: PendingJiraComment[];
  /** Which comments are in the ticket's review, and why more cannot be added now (null: they can). */
  review: { importedIds: string[]; refusal: string | null };
};
