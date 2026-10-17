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
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { ProvisionConfig } from '../provision';
import { loadReview, reviewContainerNames } from '../review-checkout';
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
 * A ticket's or a pull request's preview: its compose project, settings, workspace, the services the proxy serves and
 * their addresses, and its variables (`plain` with their templates filled in; `secrets` the values,
 * which only the files Docker reads hold).
 */
export type Target = {
  owner: WorkspaceOwner;
  projectId: number;
  project: string;
  config: PreviewConfig;
  workspaceVolume: string;
  exposed: ExposedService[];
  urls: { service: string; url: string }[];
  plain: Record<string, string>;
  secrets: Record<string, string>;
};

/**
 * What a preview runs from: the owner's project, its workspace (null: none yet, `missing` says why),
 * the pull request's number for `{pr.number}`, and whether it gets the project's secret variables.
 */
type Source = {
  projectId: number;
  workspaceVolume: string | null;
  missing: string;
  prNumber: number | null;
  secrets: boolean;
};

function sourceOf(db: Db, owner: WorkspaceOwner): Source {
  if ('ticketId' in owner) {
    const ticket = getTicket(db, owner.ticketId);
    return {
      projectId: ticket.projectId,
      workspaceVolume: ticket.workspaceVolume,
      missing: 'The ticket has no workspace yet: run the implementation first',
      prNumber: null,
      secrets: true,
    };
  }
  const review = loadReview(db, owner.reviewId);
  return {
    projectId: review.projectId,
    workspaceVolume:
      review.checkoutSha === null ? null : reviewContainerNames(review.id).workspaceVolume,
    missing: 'The pull request is not checked out yet: start its preview again',
    prNumber: review.prNumber,
    // A fork's code never gets them: only a commit on a branch of the repository itself.
    secrets: !review.fromFork && review.checkoutInRepo,
  };
}

function previewConfigOf(db: Db, projectId: number): PreviewConfig {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  const config = project?.config.preview;
  if (!config) {
    throw new PreviewError('The project has no preview settings (project settings → Preview)');
  }
  return config;
}

export function loadTarget(deps: PreviewDeps, owner: WorkspaceOwner): Target {
  const source = sourceOf(deps.db, owner);
  const config = previewConfigOf(deps.db, source.projectId);
  if (!source.workspaceVolume) {
    throw new PreviewError(source.missing);
  }
  const services = exposedServices(config);
  if (services.length === 0) {
    throw new PreviewError('The preview settings expose no service (project settings → Preview)');
  }
  const { publicPort } = deps.settings;
  const context = { owner, prNumber: source.prNumber, publicPort, exposed: services };
  const exposed = services.map((service) => ({
    service: service.name,
    port: service.port,
    host: previewServiceHost(owner, service.prefix),
  }));
  return {
    owner,
    projectId: source.projectId,
    project: previewProject(owner),
    config,
    workspaceVolume: source.workspaceVolume,
    exposed,
    urls: exposed.map(({ service, host }) => ({ service, url: previewAddress(host, publicPort) })),
    plain: Object.fromEntries(
      Object.entries(config.env).map(([key, value]) => [
        key,
        renderPreviewTemplate(value, context),
      ]),
    ),
    secrets: source.secrets ? previewSecretValues(deps.db, source.projectId) : {},
  };
}

/** Where relative paths of the compose file start: its own folder in the repository. */
export function projectDirectory(target: Target): string {
  return path.posix.dirname(path.posix.join(PREVIEW_REPO_DIR, target.config.composeFile));
}

export function lastLines(lines: string[]): string {
  return lines.slice(-REASON_LINES).join('\n');
}
