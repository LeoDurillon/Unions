// What the Jira part of a pull request review reads: an issue found to link, and the linked issues' text and comments.
import type { TrackerProperty, TrackerThreads } from '@union/core';

import type { PendingTrackerField } from './tracker-field-types';

/** An issue found by a check or a suggestion: its key, summary and link. */
export type ReviewJiraLink = { key: string; summary: string; url: string };

/** A linked issue as the review's Jira tab shows it; `threads` is the reason when its comments could not be read. */
export type ReviewJiraIssue = ReviewJiraLink & {
  markdown: string;
  threads: TrackerThreads | { error: string };
  /** Its status and fields (none when Jira did not give them), and those being set from the review's tab. */
  properties: TrackerProperty[];
  pendingFields: PendingTrackerField[];
};
