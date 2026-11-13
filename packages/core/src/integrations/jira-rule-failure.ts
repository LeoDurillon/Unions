// A Jira call of a rule that failed, as the delivery's outcome: tried again later, or failed with the reason.
// Rate limits, Jira outages and network failures are tried again; a refusal names the permission it lacks.

import type { DeliveryOutcome } from '../event/delivery-outcome';
import { JiraError } from './jira-error';

const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

export function jiraRuleFailure(
  error: unknown,
  permission: string,
  tried: string,
): DeliveryOutcome {
  if (
    !(error instanceof JiraError) ||
    error.status === TOO_MANY_REQUESTS ||
    error.status >= SERVER_ERROR
  ) {
    return { status: 'retry', error: error instanceof Error ? error.message : String(error) };
  }
  const message =
    error.status === FORBIDDEN
      ? `Jira refused: the account needs the "${permission}" permission in the Jira project`
      : error.message;
  return { status: 'failed', error: message, detail: `Tried: ${tried}` };
}
