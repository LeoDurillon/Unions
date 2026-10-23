// The error Notion calls throw, carrying the HTTP status the web server answers with.
/** A Notion failure with the HTTP status to answer with (401 bad token, 404 not shared). */
export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
