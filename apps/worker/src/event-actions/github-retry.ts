// Which GitHub failures a rule action tries again later: rate limits, outages and network errors.
import { RequestError } from 'octokit';

const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

/** Rate limits (403 or 429), GitHub outages and network failures pass: try again later. */
export function isTemporary(error: unknown): boolean {
  if (!(error instanceof RequestError)) {
    return true;
  }
  return (
    error.status === TOO_MANY_REQUESTS ||
    error.status >= SERVER_ERROR ||
    (error.status === FORBIDDEN && /rate limit/iu.test(error.message))
  );
}
