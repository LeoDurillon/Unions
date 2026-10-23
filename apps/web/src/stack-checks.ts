// The CI of a split ticket's open slices, one count per check state for each slice's pull request.
import { openSlices, type Db } from '@union/core';

import type { CheckCounts, PullRequestCheck, StackChecksView } from './ci-api-types';
import type { CiSource } from './ci-picks';

function countChecks(checks: readonly PullRequestCheck[]): CheckCounts {
  const counts: CheckCounts = { pending: 0, passed: 0, failed: 0, skipped: 0 };
  for (const check of checks) {
    counts[check.state] += 1;
  }
  return counts;
}

/** Read in parallel, one listing per slice with a pull request. */
export async function stackChecks(
  db: Db,
  ticketId: number,
  source: CiSource,
): Promise<StackChecksView> {
  const slices = await Promise.all(
    openSlices(db, ticketId).flatMap(({ position, prNumber }) =>
      prNumber === null
        ? []
        : [
            source.ci.listChecks(source.auth, source.repo, prNumber).then((found) => ({
              position,
              prNumber,
              counts: found ? countChecks(found.checks) : null,
            })),
          ],
    ),
  );
  return { slices };
}
