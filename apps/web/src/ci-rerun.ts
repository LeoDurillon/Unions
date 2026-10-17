// Which check of the pull request can be run again (a failed GitHub Actions job), and the command that asks the worker to.
import { schema, type Db } from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';

import type { PullRequestChecks } from './ci-api-types';
import { CONFLICT, fail } from './http';

const RUN_PREFIX = 'run:';

/** The failed Actions job `checkId` names in the listing, or the reason it cannot run again. */
function rerunnable(found: PullRequestChecks, checkId: unknown): { jobId: number; name: string } {
  const check = found.checks.find((one) => one.id === checkId);
  if (!check) {
    throw fail(CONFLICT, 'This check is not on the pull request’s last commit any more');
  }
  if (check.state !== 'failed') {
    throw fail(CONFLICT, `${check.name} did not fail`);
  }
  const jobId = Number(check.id.slice(RUN_PREFIX.length));
  if (
    check.workflowRunId === null ||
    !check.id.startsWith(RUN_PREFIX) ||
    !Number.isInteger(jobId)
  ) {
    throw fail(CONFLICT, `${check.name} is not a GitHub Actions job: re-run it where it runs`);
  }
  return { jobId, name: check.name };
}

/** Queues `rerun_ci_job` for the worker, once per job while it waits. */
export function queueRerun(
  db: Db,
  ticketId: number,
  found: PullRequestChecks,
  checkId: unknown,
): void {
  const job = rerunnable(found, checkId);
  const waiting = db
    .select({ payload: schema.commands.payload })
    .from(schema.commands)
    .where(
      and(
        eq(schema.commands.ticketId, ticketId),
        eq(schema.commands.type, 'rerun_ci_job'),
        isNull(schema.commands.handledAt),
      ),
    )
    .all()
    .some(
      (command) =>
        typeof command.payload === 'object' &&
        command.payload !== null &&
        'jobId' in command.payload &&
        command.payload.jobId === job.jobId,
    );
  if (waiting) {
    throw fail(CONFLICT, `${job.name} is already being run again`);
  }
  db.insert(schema.commands).values({ type: 'rerun_ci_job', ticketId, payload: job }).run();
}
