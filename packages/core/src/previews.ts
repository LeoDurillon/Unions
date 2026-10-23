import { eq, inArray } from 'drizzle-orm';

import type { Db } from './db';
import { previewServiceHost } from './preview-config';
import * as schema from './tables';
import { emitEvent, getTicket } from './tickets';
import {
  ownerColumns,
  ownerKey,
  ownerOf,
  ticketOwnerId,
  type WorkspaceOwner,
} from './workspace-owner';

export type Preview = typeof schema.previews.$inferSelect;
export type PreviewStatus = Preview['status'];

/** A preview holding containers, or about to: what the running cap counts. */
const ACTIVE: PreviewStatus[] = ['starting', 'running', 'stopping'];

/** What a helper may change: not the row's identity. */
type PreviewValues = Partial<
  Omit<Preview, 'id' | 'ticketId' | 'reviewId' | 'projectId' | 'updatedAt'>
>;

/** The owner's compose project, its containers' prefix (`union-t12-web-1`, `union-r3-web-1`). */
export function previewProject(owner: WorkspaceOwner): string {
  return `union-${ownerKey(owner)}`;
}

export function previewHost(owner: WorkspaceOwner): string {
  return previewServiceHost(owner, '');
}

/** The owner of a preview row. */
export function previewOwner(row: Preview): WorkspaceOwner {
  return ownerOf(row);
}

/** A ticket's preview, not a pull request's. */
export function isTicketPreview(row: Preview): row is Preview & { ticketId: number } {
  return row.ticketId !== null;
}

function ownerColumn(
  owner: WorkspaceOwner,
): typeof schema.previews.ticketId | typeof schema.previews.reviewId {
  return 'ticketId' in owner ? schema.previews.ticketId : schema.previews.reviewId;
}

function ownerId(owner: WorkspaceOwner): number {
  return 'ticketId' in owner ? owner.ticketId : owner.reviewId;
}

export function getPreview(db: Db, owner: WorkspaceOwner): Preview | null {
  return (
    db
      .select()
      .from(schema.previews)
      .where(eq(ownerColumn(owner), ownerId(owner)))
      .get() ?? null
  );
}

function projectOf(db: Db, owner: WorkspaceOwner): number {
  if ('ticketId' in owner) {
    return getTicket(db, owner.ticketId).projectId;
  }
  const review = db
    .select({ projectId: schema.currentReviews.projectId })
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, owner.reviewId))
    .get();
  if (!review) {
    throw new Error(`Review ${owner.reviewId} not found`);
  }
  return review.projectId;
}

/**
 * Records the preview's new state. A ticket's changes are events on the ticket, so its panel
 * refreshes; a review's page polls instead.
 */
export function updatePreview(
  db: Db,
  owner: WorkspaceOwner,
  values: PreviewValues & { status: PreviewStatus },
): Preview {
  const set = { ...values, updatedAt: Date.now() };
  const row = db
    .insert(schema.previews)
    .values({ ...ownerColumns(owner), projectId: projectOf(db, owner), ...set })
    .onConflictDoUpdate({ target: ownerColumn(owner), set })
    .returning()
    .get();
  const ticketId = ticketOwnerId(owner);
  if (ticketId !== null) {
    emitEvent(db, {
      type: 'preview_changed',
      ticketId,
      payload: { status: row.status, url: row.url, error: row.error },
    });
  }
  return row;
}

/** Changes other than the status (the compose file, the user's edit): the status stays as it is. */
function patchPreview(
  db: Db,
  owner: WorkspaceOwner,
  values: Omit<PreviewValues, 'status'>,
): Preview {
  return updatePreview(db, owner, {
    status: getPreview(db, owner)?.status ?? 'stopped',
    ...values,
  });
}

/** The file Union generated (YAML), or why it could not. */
export function saveGeneratedCompose(
  db: Db,
  owner: WorkspaceOwner,
  result: { yaml: string } | { error: string },
  catalog?: Preview['composeCatalog'],
): Preview {
  return patchPreview(db, owner, {
    composeYaml: 'yaml' in result ? result.yaml : null,
    composeError: 'error' in result ? result.error : null,
    composeAt: Date.now(),
    ...(catalog ? { composeCatalog: catalog } : {}),
  });
}

/** The state or result of the e2e run the user asked for; the preview's own status is kept. */
export function recordE2e(
  db: Db,
  owner: WorkspaceOwner,
  values: Pick<Preview, 'e2eStatus'> &
    Partial<Pick<Preview, 'e2eOutput' | 'e2eExitCode' | 'e2eScreenshots'>>,
): Preview {
  return patchPreview(db, owner, {
    e2eOutput: null,
    e2eExitCode: null,
    e2eScreenshots: null,
    ...values,
    e2eAt: Date.now(),
  });
}

/** The user's own compose file for this preview; null goes back to the generated one. */
export function setComposeOverride(db: Db, owner: WorkspaceOwner, yaml: string | null): Preview {
  return patchPreview(db, owner, {
    override: yaml,
    overrideAt: yaml === null ? null : Date.now(),
  });
}

export function activePreviews(db: Db): Preview[] {
  return db.select().from(schema.previews).where(inArray(schema.previews.status, ACTIVE)).all();
}

/**
 * What a stopped worker left half done: a start or a stop it was running failed. Running previews
 * are left as they are: their containers do not depend on the worker.
 */
export function recoverPreviews(db: Db): void {
  const testing = db
    .select()
    .from(schema.previews)
    .where(eq(schema.previews.e2eStatus, 'running'))
    .all();
  for (const row of testing) {
    recordE2e(db, previewOwner(row), {
      e2eStatus: 'skipped',
      e2eOutput: 'The worker stopped during the run: run the tests again',
    });
  }
  for (const row of activePreviews(db).filter((preview) => preview.status !== 'running')) {
    updatePreview(db, previewOwner(row), {
      status: 'failed',
      error: `The worker stopped while the preview was ${row.status === 'starting' ? 'starting' : 'stopping'}: start or stop it again`,
    });
  }
}
