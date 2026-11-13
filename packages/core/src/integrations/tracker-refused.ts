// The error a tracker adapter throws when the tracker refuses a read the integration lacks a permission for.

/** The message says which permission to turn on; the web answers it as a conflict. */
export class TrackerRefusedError extends Error {}
