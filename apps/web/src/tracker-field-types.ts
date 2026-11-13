// What a tracker tab reads about the properties being set: the changes the worker has not sent yet.

/** A change queued for the worker that the tracker does not have yet: the field and its new value as read. */
export type PendingTrackerField = {
  commandId: number;
  fieldId: string;
  text: string;
  createdAt: number;
};
