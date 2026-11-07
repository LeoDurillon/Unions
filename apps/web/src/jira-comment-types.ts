// What the ticket's Jira tab reads: the issue's comments, read from Jira now, and those still being sent.
import type { JiraComment } from '@union/core';

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
  comments: JiraComment[];
  total: number;
  pending: PendingJiraComment[];
};
