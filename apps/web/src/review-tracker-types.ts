// What a pull request under review's tracker tab reads: its linked items, with their text and comments as read now.
import type { TrackerProperty, TrackerThreads } from '@union/core';

import type { PendingTrackerField } from './tracker-field-types';

/** A linked item, its text cleaned as a ticket's imported description is. */
export type ReviewTrackerItem = {
  itemId: string;
  title: string;
  url: string;
  markdown: string;
  /** The tracker cut a long text short. */
  truncated: boolean;
  /** Its comments, or why they could not be read (the text still shows). */
  threads: TrackerThreads | { error: string };
  /** Its properties, and those being set from the review's tab. */
  properties: TrackerProperty[];
  pendingFields: PendingTrackerField[];
};
