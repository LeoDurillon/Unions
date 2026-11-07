// What the ticket's Jira tab reads: the issue's comments, read from Jira now.
import type { JiraComment } from '@union/core';

/** `total`: how many comments the issue has, more than `comments` when the oldest are left out. */
export type JiraTabView = { key: string; issueUrl: string; comments: JiraComment[]; total: number };
