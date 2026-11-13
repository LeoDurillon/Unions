// A property's new value while it is edited in a tracker tab: as a rule's value is typed, what is picked, and as read.

import type { TrackerProperty } from '@union/core';

/** `value` as a rule's is typed, `picks` what a picked field holds (ids with names), `text` as the user reads it. */
export type TrackerDraft = {
  value: string;
  picks: { id: string; name: string }[];
  text: string;
};

/** Where editing starts: the property as the tracker gave it. */
export function draftOf(property: TrackerProperty): TrackerDraft {
  return { value: property.value, picks: property.picks ?? [], text: property.text };
}
