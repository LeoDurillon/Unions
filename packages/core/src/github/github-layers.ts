// Which optional GitHub layers a project uses: its GitHub Project (the board) and issues mirroring its tickets.

import type { ProjectConfig } from '../schema/schema-types';

type ProjectLayers = {
  githubProjectNodeId: string;
  githubProjectUrl: string | null;
  config: ProjectConfig;
};

/** A GitHub Project is connected: its node id is known, or its URL waits for the worker to resolve it. */
export function hasGitHubProject(project: ProjectLayers): boolean {
  return project.githubProjectNodeId !== '' || (project.githubProjectUrl ?? '') !== '';
}

/** New tickets get a GitHub issue: the setting (default on), and always with a Project, which needs issues. */
export function mirrorsIssues(project: ProjectLayers): boolean {
  return project.config.mirrorIssues !== false || hasGitHubProject(project);
}
