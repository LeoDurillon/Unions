// What the Jira part of a pull request review reads: an issue found to link, and the linked issues' text and comments.
import type { JiraComment } from '@union/core';

/** An issue found by a check or a suggestion: its key, summary and link. */
export type ReviewJiraLink = { key: string; summary: string; url: string };

/** A linked issue as the review's Jira tab shows it; `comments` is the reason when they could not be read. */
export type ReviewJiraIssue = ReviewJiraLink & {
  markdown: string;
  comments: JiraComment[] | { error: string };
};
