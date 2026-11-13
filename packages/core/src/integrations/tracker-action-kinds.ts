// The kinds of rule action a tracker can take: move its item, set its fields, comment on it; browser-safe.

export const TRACKER_ACTION_KINDS = [
  'tracker_status',
  'tracker_fields',
  'tracker_comment',
] as const;

export type TrackerActionKind = (typeof TRACKER_ACTION_KINDS)[number];
