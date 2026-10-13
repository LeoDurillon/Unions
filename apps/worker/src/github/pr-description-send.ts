import {
  finishSendingPrDescription,
  getPrDescription,
  getTicket,
  schema,
  type Db,
  type Project,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { pullRequestBody } from '../publish';
import type { GitHubApi } from './api';

function sameText(left: string, right: string): boolean {
  return left.replaceAll('\r\n', '\n').trim() === right.replaceAll('\r\n', '\n').trim();
}

/**
 * Writes the user's version of a rewritten description to the pull request, with Union's links
 * added back, unless the description on GitHub changed since the agent read it: then nothing is
 * written, so an edit made on GitHub is never overwritten unseen.
 */
export async function sendPrDescription(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  id: number,
): Promise<void> {
  const row = getPrDescription(db, id);
  if (row?.status !== 'sending') {
    return;
  }
  try {
    const ticket = getTicket(db, row.ticketId);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, ticket.projectId))
      .get();
    const api = project ? apiFor(project) : null;
    if (!project || !api) {
      throw new Error('This project has no GitHub credentials');
    }
    const repo = { owner: project.owner, repo: project.repo };
    const current = await api.pullRequestBody(repo, row.prNumber);
    if (!sameText(current, row.original ?? '')) {
      finishSendingPrDescription(db, id, { status: 'conflict' });
      return;
    }
    await api.updatePullRequestBody(repo, row.prNumber, pullRequestBody(db, ticket, row.text));
    finishSendingPrDescription(db, id, { status: 'sent' });
  } catch (error) {
    finishSendingPrDescription(db, id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
