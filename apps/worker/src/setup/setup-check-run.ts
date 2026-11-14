// Runs one check of a setup proposal in a throwaway container without the Claude login, on a fresh clone.
// It clones the base branch, then puts the project's files in, as for a ticket; the container and its volumes go after.

import { schema, setSetupCheckStage, type SetupCheck, type SetupCheckOutcome } from '@union/core';
import { eq } from 'drizzle-orm';

import { projectGitToken } from '../credentials';
import { workerPreviewSettings } from '../preview/compose';
import { syncProjectFiles } from '../project-files-sync';
import { cloneInto, cloneSource, type TicketContainer } from '../provision';
import { inThrowaway, type ThrowawayDeps } from '../throwaway-container';
import { runSetupCommands } from './setup-check-commands';
import { previewProblem } from './setup-preview-check';

export type SetupCheckDeps = Omit<ThrowawayDeps, 'projectId' | 'noLogin'>;

export function setupCheckContainer(checkId: number): TicketContainer {
  return {
    name: `union-sc${checkId}`,
    homeVolume: `union-sc${checkId}-home`,
    workspaceVolume: `union-sc${checkId}-ws`,
  };
}

function projectOf(deps: SetupCheckDeps, check: SetupCheck): typeof schema.projects.$inferSelect {
  const investigation = deps.db
    .select({ projectId: schema.investigations.projectId })
    .from(schema.investigations)
    .where(eq(schema.investigations.id, check.investigationId))
    .get();
  const project = investigation
    ? deps.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, investigation.projectId))
        .get()
    : undefined;
  if (!project) {
    throw new Error('The setup run or its project was removed');
  }
  return project;
}

async function previewOutcome(
  deps: SetupCheckDeps,
  check: SetupCheck & { input: { kind: 'preview' } },
  projectId: number,
  names: TicketContainer,
): Promise<SetupCheckOutcome> {
  setSetupCheckStage(deps.db, check.id, 'resolving');
  const problem = await previewProblem(
    { db: deps.db, runtime: deps.runtime, settings: workerPreviewSettings(deps.db) },
    {
      projectId,
      config: check.input.preview,
      project: names.name,
      workspaceVolume: names.workspaceVolume,
    },
  );
  return problem === null
    ? { status: 'passed', output: 'The compose file resolves and passes the preview checks.' }
    : { status: 'failed', output: problem };
}

function isPreview(check: SetupCheck): check is SetupCheck & { input: { kind: 'preview' } } {
  return check.input.kind === 'preview';
}

/** Clones the base branch, puts the project's files in, then runs the commands or checks the preview. */
export function runSetupCheck(
  deps: SetupCheckDeps,
  check: SetupCheck,
  signal: AbortSignal,
): Promise<SetupCheckOutcome> {
  const project = projectOf(deps, check);
  const names = setupCheckContainer(check.id);
  const throwaway = { ...deps, projectId: project.id, noLogin: true };
  return inThrowaway(throwaway, names, async (container): Promise<SetupCheckOutcome> => {
    const token = await projectGitToken(deps.db, project);
    const source = cloneSource(deps.config.gitBaseUrl, project.owner, project.repo, token);
    await cloneInto(deps.runtime, container, source, project.config.baseBranch);
    await syncProjectFiles(deps.db, deps.runtime, project.id, {
      volume: names.workspaceVolume,
      image: deps.config.image,
    });
    if (isPreview(check)) {
      return previewOutcome(deps, check, project.id, names);
    }
    const { input } = check;
    return runSetupCommands(
      deps,
      {
        checkId: check.id,
        container,
        installCommand: input.kind === 'checks' ? input.installCommand : '',
        gateCommand: input.kind === 'checks' ? input.gateCommand : '',
      },
      signal,
    );
  });
}
