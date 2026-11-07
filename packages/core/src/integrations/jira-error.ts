// The error Jira calls throw, carrying the HTTP status the web server answers with.

/** A Jira failure with the HTTP status to answer with (401 bad email or token, 404 not visible). */
export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
