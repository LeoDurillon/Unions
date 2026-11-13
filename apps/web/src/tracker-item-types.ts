// What a tracker tab reads about the item itself, for its card: one shape for every tracker.
import type { IntegrationKindName, TrackerItemFacts } from '@union/core';

import type { PendingTrackerField } from './tracker-field-types';

/** `item` is null when the tracker could not read it; the comments still show. */
export type TrackerItemView = {
  kind: IntegrationKindName;
  itemId: string;
  url: string;
  item: TrackerItemFacts | null;
  /** The properties being set: queued, not sent to the tracker yet. */
  pendingFields: PendingTrackerField[];
};
