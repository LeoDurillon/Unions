// Queues the setup agent (a repository investigation of kind `setup`) and reads a project's latest one with its proposal.
import { and, desc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { SETUP_DEFAULT_MODEL } from '../investigation-defaults';
import { createInvestigation, InvestigationError, type Investigation } from '../investigations';
import * as schema from '../schema/schema';
import { setupPrompt } from './setup-prompt';
import { parseSetupProposal } from './setup-proposal';
import type { SetupProposal } from './setup-proposal-types';

/** Reading the repository is all it needs: the worker checks what it proposes. */
const SETUP_TOOLS = ['Read', 'Grep', 'Glob'];

/** The project's latest setup run: only one runs at a time, so it is the one that may be busy. */
function latestRun(db: Db, projectId: number): Investigation | undefined {
  return db
    .select()
    .from(schema.investigations)
    .where(
      and(eq(schema.investigations.projectId, projectId), eq(schema.investigations.kind, 'setup')),
    )
    .orderBy(desc(schema.investigations.id))
    .limit(1)
    .get();
}

/** Queues a setup run on the project's base branch; refused while another one waits or runs. */
export function queueSetup(
  db: Db,
  projectId: number,
  model: string = SETUP_DEFAULT_MODEL,
): Investigation {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new InvestigationError(`Project ${projectId} not found`);
  }
  const status = latestRun(db, projectId)?.status;
  if (status === 'queued' || status === 'running') {
    throw new InvestigationError('A setup run of this project has not finished yet');
  }
  const { title, prompt } = setupPrompt(`${project.owner}/${project.repo}`);
  return createInvestigation(db, {
    projectId,
    title,
    prompt,
    scope: 'repository',
    kind: 'setup',
    model,
    tools: SETUP_TOOLS,
  });
}

/** A setup run and what its answer proposes (null while unanswered, or when the answer has no block). */
export type SetupView = { investigation: Investigation; proposal: SetupProposal | null };

/** The project's latest setup run; null when it never had one. */
export function latestSetup(db: Db, projectId: number): SetupView | null {
  const investigation = latestRun(db, projectId);
  if (!investigation) {
    return null;
  }
  const answer = investigation.status === 'succeeded' ? (investigation.result ?? '') : '';
  return { investigation, proposal: answer === '' ? null : parseSetupProposal(answer) };
}
