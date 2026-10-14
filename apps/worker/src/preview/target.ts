import path from 'node:path';

import {
  exposedServices,
  getTicket,
  PREVIEW_REPO_DIR,
  previewAddress,
  previewProject,
  previewSecretValues,
  previewServiceHost,
  renderPreviewTemplate,
  schema,
  type ContainerRuntime,
  type Db,
  type ExposedService,
  type PreviewConfig,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { ProvisionConfig } from '../provision';
import type { PreviewSettings } from './compose';

const REASON_LINES = 20;

export type PreviewDeps = {
  db: Db;
  runtime: ContainerRuntime;
  settings: PreviewSettings;
  /** For the e2e runs the user asks for, which start the ticket's container. */
  config?: ProvisionConfig;
  readyTimeoutMs?: number;
  readyIntervalMs?: number;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
};

/**
 * Why a preview cannot start or stopped; its message is shown on the ticket. `unavailable`: it
 * cannot run now, whatever the ticket's code (no proxy, too many running).
 */
export class PreviewError extends Error {
  constructor(
    message: string,
    readonly unavailable = false,
  ) {
    super(message);
  }
}

/**
 * A ticket's preview: its compose project, settings, workspace, the services the proxy serves and
 * their addresses, and its variables (`plain` with their templates filled in; `secrets` the values,
 * which only the files Docker reads hold).
 */
export type Target = {
  ticketId: number;
  project: string;
  config: PreviewConfig;
  workspaceVolume: string;
  exposed: ExposedService[];
  urls: { service: string; url: string }[];
  plain: Record<string, string>;
  secrets: Record<string, string>;
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
  const services = exposedServices(config);
  if (services.length === 0) {
    throw new PreviewError('The preview settings expose no service (project settings → Preview)');
  }
  const context = { ticketId, publicPort: deps.settings.publicPort, exposed: services };
  const exposed = services.map((service) => ({
    service: service.name,
    port: service.port,
    host: previewServiceHost(ticketId, service.prefix),
  }));
  return {
    ticketId,
    project: previewProject(ticketId),
    config,
    workspaceVolume: ticket.workspaceVolume,
    exposed,
    urls: exposed.map(({ service, host }) => ({
      service,
      url: previewAddress(host, deps.settings.publicPort),
    })),
    plain: Object.fromEntries(
      Object.entries(config.env).map(([key, value]) => [
        key,
        renderPreviewTemplate(value, context),
      ]),
    ),
    secrets: previewSecretValues(deps.db, ticket.projectId),
  };
}

/** Where relative paths of the compose file start: its own folder in the repository. */
export function projectDirectory(target: Target): string {
  return path.posix.dirname(path.posix.join(PREVIEW_REPO_DIR, target.config.composeFile));
}

export function lastLines(lines: string[]): string {
  return lines.slice(-REASON_LINES).join('\n');
}
