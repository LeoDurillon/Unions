// What a preview's routes share for a ticket and for a pull request under review: the view, the refusals, the commands.
import { getPreview, schema, type Db, type PreviewConfig, type WorkspaceOwner } from '@union/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import type { PreviewView } from '../api-types';
import { BAD_REQUEST, fail, readObject } from '../http';

/** A compose file, not a dump: Union's own are a few kilobytes. */
const MAX_COMPOSE_CHARS = 200_000;

/**
 * Whose preview it is, its project, why its workspace cannot run one yet (null: it can), and why
 * its e2e tests must wait (null: they need not).
 */
export type PreviewSubject = {
  owner: WorkspaceOwner;
  projectId: number;
  noWorkspace: string | null;
  e2eBusy: string | null;
};

export function previewConfig(db: Db, subject: PreviewSubject): PreviewConfig | undefined {
  return db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, subject.projectId))
    .get()?.config.preview;
}

function ownedBy(owner: WorkspaceOwner): ReturnType<typeof and> {
  return 'ticketId' in owner
    ? eq(schema.commands.ticketId, owner.ticketId)
    : and(
        isNull(schema.commands.ticketId),
        sql`json_extract(${schema.commands.payload}, '$.reviewId') = ${owner.reviewId}`,
      );
}

/** A preview command of the owner the worker has not handled yet (`review_checkout_update` included). */
export function pendingPreviewCommand(db: Db, owner: WorkspaceOwner): boolean {
  const row = db
    .select({ id: schema.commands.id, type: schema.commands.type })
    .from(schema.commands)
    .where(and(ownedBy(owner), isNull(schema.commands.handledAt)))
    .all()
    .find((command) => command.type.startsWith('preview_') || command.type.startsWith('review_'));
  return row !== undefined;
}

/** Why it cannot start now; null when it can. */
export function previewRefusal(db: Db, subject: PreviewSubject): string | null {
  if (previewConfig(db, subject) === undefined) {
    return 'Set up previews in the project settings (Preview) first.';
  }
  if (subject.noWorkspace !== null) {
    return subject.noWorkspace;
  }
  const status = getPreview(db, subject.owner)?.status;
  return status === 'starting' || status === 'stopping' || pendingPreviewCommand(db, subject.owner)
    ? 'The preview is already starting or stopping.'
    : null;
}

/** Why the e2e tests cannot run now: one run per owner at a time, and the preview's own reasons. */
export function e2eRefusal(db: Db, subject: PreviewSubject): string | null {
  if (!previewConfig(db, subject)?.e2eCommand) {
    return 'Set an end-to-end command in the project settings (Preview) first.';
  }
  if (subject.e2eBusy !== null) {
    return subject.e2eBusy;
  }
  const busy = previewRefusal(db, subject);
  if (busy !== null) {
    return busy;
  }
  return getPreview(db, subject.owner)?.e2eStatus === 'running'
    ? 'The end-to-end tests are already running.'
    : null;
}

/** Why there is nothing to stop, or no logs to read; null when there is. */
export function stopRefusal(db: Db, owner: WorkspaceOwner): string | null {
  return pendingPreviewCommand(db, owner) || getPreview(db, owner) === null
    ? 'There is no preview to stop.'
    : null;
}

export function logsRefusal(db: Db, owner: WorkspaceOwner): string | null {
  return getPreview(db, owner)?.status === 'running' ? null : 'The preview is not running.';
}

export function previewView(db: Db, subject: PreviewSubject): PreviewView {
  const config = previewConfig(db, subject);
  return {
    preview: getPreview(db, subject.owner),
    configured: config !== undefined,
    composeFile: config?.composeFile ?? null,
    e2eCommand: config?.e2eCommand ?? null,
    e2eRefusal: e2eRefusal(db, subject),
    refusal: previewRefusal(db, subject),
  };
}

/** Queues a preview command for the worker: a ticket's carries its id, a review's its id in the payload. */
export function queuePreviewCommand(db: Db, owner: WorkspaceOwner, type: string): void {
  db.insert(schema.commands)
    .values(
      'ticketId' in owner
        ? { type, ticketId: owner.ticketId }
        : { type, payload: { reviewId: owner.reviewId } },
    )
    .run();
}

/** The user's own compose file from the body (YAML), or null for the generated one again. */
export async function readOwnFile(c: Context): Promise<string | null> {
  const { yaml } = await readObject(c.req.raw);
  if (yaml !== null && (typeof yaml !== 'string' || yaml.trim() === '')) {
    throw fail(BAD_REQUEST, 'Give the compose file, or null to use the generated one');
  }
  if (typeof yaml === 'string' && yaml.length > MAX_COMPOSE_CHARS) {
    throw fail(BAD_REQUEST, 'The compose file is too long');
  }
  return yaml;
}
