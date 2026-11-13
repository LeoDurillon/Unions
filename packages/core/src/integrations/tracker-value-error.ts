// The error a tracker adapter throws when a value set by hand cannot be sent: the property is gone, or refuses it.

/** `gone`: the property is no longer on the item (the web answers 404); else the value is refused (400). */
export class TrackerValueError extends Error {
  constructor(
    message: string,
    readonly gone = false,
  ) {
    super(message);
  }
}
