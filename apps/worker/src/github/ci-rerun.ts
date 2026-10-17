// Runs a failed GitHub Actions job of a ticket's pull request again, and logs whether GitHub took it.
import { emitEvent, getTicket, isRecord, schema, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi } from './api';

const FORBIDDEN = 403;

/** The job a `rerun_ci_job` command names: its check run id, and its name for the log. */
export type CiJob = { jobId: number; name: string };

export function ciJobOf(payload: unknown): CiJob {
  const jobId = isRecord(payload) ? payload.jobId : undefined;
  if (typeof jobId !== 'number') {
    throw new TypeError('rerun_ci_job needs a numeric "jobId"');
  }
  const name = isRecord(payload) ? payload.name : undefined;
  return { jobId, name: typeof name === 'string' ? name : 'the job' };
}

function statusOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
}

/** GitHub's reason, with the permission named when it refused one. */
function reasonOf(error: unknown): string {
  if (statusOf(error) === FORBIDDEN) {
    return 'GitHub refused it: the GitHub App needs Actions read and write (accepted on its installation), a classic token the repo scope';
  }
  return error instanceof Error ? error.message : String(error);
}

/** Asks GitHub to run `job` again; `ci_job_rerun` or `ci_job_rerun_failed` on the ticket says how it went. */
export async function rerunCiJob(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  ticketId: number,
  job: CiJob,
): Promise<void> {
  try {
    const ticket = getTicket(db, ticketId);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, ticket.projectId))
      .get();
    const api = project ? apiFor(project) : null;
    if (!project || !api) {
      throw new Error('This project has no GitHub credentials');
    }
    await api.rerunJob({ owner: project.owner, repo: project.repo }, job.jobId);
    emitEvent(db, { type: 'ci_job_rerun', ticketId, payload: job });
  } catch (error) {
    emitEvent(db, {
      type: 'ci_job_rerun_failed',
      ticketId,
      payload: { ...job, error: reasonOf(error) },
    });
  }
}
