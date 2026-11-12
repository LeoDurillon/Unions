// The browser's client for a project's GitHub Project: the Projects to pick from, connecting one, disconnecting it.

import type { ProjectOption, PublicProject } from '../../../src/api-types';
import { request } from '../app/api';

/** A Project from the list, or a new one created on GitHub with this title. */
export type GitHubProjectChoice = { nodeId: string; url: string } | { title: string };

const base = (projectId: number): string => `/api/projects/${projectId}/github-project`;

export const githubProjectApi = {
  choices: (projectId: number): Promise<ProjectOption[]> =>
    request('GET', `${base(projectId)}/choices`),
  connect: (projectId: number, choice: GitHubProjectChoice): Promise<PublicProject> =>
    request('PUT', base(projectId), choice),
  disconnect: (projectId: number): Promise<PublicProject> => request('DELETE', base(projectId)),
};

/** A GitHub Project is connected: its node id is known, or its URL waits for the worker. */
export function hasBoard(project: PublicProject): boolean {
  return project.githubProjectNodeId !== '' || (project.githubProjectUrl ?? '') !== '';
}

/** The missing token scopes that matter: `project` only with a GitHub Project. */
export function blockingScopes(missing: readonly string[], board: boolean): string[] {
  return missing.filter((scope) => board || scope !== 'project');
}
