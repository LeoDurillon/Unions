// Creates the wizard's project from its draft, then starts the setup agent, and says when that start failed.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/app/api';
import { setupApi } from '../../lib/setup/setup-api';
import { credentialOf, verifiedTrackers, type Draft } from './draft';

/** The project created, and why its setup agent did not start (null when it did, or was not asked). */
export type Created = { projectId: number; setupError: string | null };

/** The new project's GitHub Project node id: none, the one picked, or one created now. */
async function boardOf(draft: Draft): Promise<string | undefined> {
  const { repo, project } = draft;
  if (!repo || project === null) {
    return undefined;
  }
  if (project.kind === 'existing') {
    return project.project.id;
  }
  const created = await api.github.createProject(credentialOf(draft), {
    ownerId: repo.ownerNodeId,
    repositoryId: repo.nodeId,
    title: project.title.trim(),
  });
  return created.id;
}

/** Starts the setup agent; the project exists either way, so a failure is told, not thrown. */
async function startSetup(projectId: number, draft: Draft): Promise<string | null> {
  if (!draft.setupAgent) {
    return null;
  }
  try {
    await setupApi.start(projectId, draft.setupModel);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function createFrom(draft: Draft): Promise<Created> {
  const { repo } = draft;
  if (!repo) {
    throw new Error('Pick a repository first.');
  }
  const githubProjectNodeId = await boardOf(draft);
  const created = await api.createProject({
    owner: repo.owner,
    repo: repo.name,
    baseBranch: draft.baseBranch.trim(),
    ...credentialOf(draft),
    ...(githubProjectNodeId === undefined ? {} : { githubProjectNodeId }),
    integrations: verifiedTrackers(draft),
  });
  return { projectId: created.id, setupError: await startSetup(created.id, draft) };
}

/**
 * Creating the project: done goes to it at once, unless its setup agent did not start, which the
 * wizard tells first (`created`).
 */
export function useFinish(onFinished: (projectId: number) => void): {
  finish: (draft: Draft) => void;
  pending: boolean;
  error: Error | null;
  created: Created | null;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createFrom,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (created.setupError === null) {
        onFinished(created.projectId);
      }
    },
  });
  return {
    finish: mutation.mutate,
    pending: mutation.isPending,
    error: mutation.error,
    created: mutation.data?.setupError ? mutation.data : null,
  };
}
