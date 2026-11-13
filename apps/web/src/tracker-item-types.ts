// What a ticket's tracker tab reads about the item itself, for its card: one shape per tracker until they share one.
import type { JiraIssueFacts, TrackerProperty } from '@union/core';

import type { PendingTrackerField } from './tracker-field-types';

/** The page itself as Notion has it now: its title, its status column's value, when it changed, its properties. */
export type NotionPageFacts = {
  title: string;
  status: { name: string; value: string } | null;
  editedAt: string | null;
  properties: TrackerProperty[];
};

/** `page` is null when Notion could not read it; the comments still show. */
export type NotionItemView = {
  kind: 'notion';
  pageUrl: string;
  page: NotionPageFacts | null;
  /** The properties being set: queued, not sent to Notion yet. */
  pendingFields: PendingTrackerField[];
};

/** `issue` is null when Jira could not read it; the comments still show. */
export type JiraItemView = {
  kind: 'jira';
  key: string;
  issueUrl: string;
  issue: JiraIssueFacts | null;
  /** The fields being set: queued, not sent to Jira yet. */
  pendingFields: PendingTrackerField[];
};

export type TrackerItemView = NotionItemView | JiraItemView;
