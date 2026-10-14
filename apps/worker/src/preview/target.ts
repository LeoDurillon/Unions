import path from 'node:path';

import {
  getTicket,
  PREVIEW_REPO_DIR,
  previewHost,
  previewProject,
  schema,
  type ContainerRuntime,
  type Db,
  type PreviewConfig,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewUrl, type PreviewSettings } from './compose';

const REASON_LINES = 20;

export type PreviewDeps = {
  db: Db;
  runtime: ContainerRuntime;
  settings: PreviewSettings;
  readyTimeoutMs?: number;
  readyIntervalMs?: number;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
};

/** Why a preview cannot start or stopped; its message is shown on the ticket. */
export class PreviewError extends Error {}

/** A ticket's preview: its compose project, settings, workspace and address. */
export type Target = {
  ticketId: number;
  project: string;
  config: PreviewConfig;
  workspaceVolume: string;
  url: string;
};

export function loadTarget(deps: PreviewDeps, ticketId: number): Target {
  const ticket = getTicket(deps.db, ticketId);
  const project = deps.db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  const config = project?.config.preview;
  if (!config) {
    throw new PreviewError('The project has no preview settings (project settings → Preview)');
  }
  if (!ticket.workspaceVolume) {
    throw new PreviewError('The ticket has no workspace yet: run the implementation first');
  }
  return {
    ticketId,
    project: previewProject(ticketId),
    config,
    workspaceVolume: ticket.workspaceVolume,
    url: previewUrl(previewHost(ticketId), deps.settings),
  };
}

/** Where relative paths of the compose file start: its own folder in the repository. */
export function projectDirectory(target: Target): string {
  return path.posix.dirname(path.posix.join(PREVIEW_REPO_DIR, target.config.composeFile));
}

export function lastLines(lines: string[]): string {
  return lines.slice(-REASON_LINES).join('\n');
}
