// What the review's tracker routes share: the tracker `:kind` names, its adapter, the project's access to it.

import {
  integrationKind,
  integrationOf,
  linkedTrackerItems,
  trackerAdapter,
  type Db,
  type IntegrationApis,
  type IntegrationKindName,
  type TrackerAccess,
  type TrackerAdapter,
} from '@union/core';
import type { Context } from 'hono';

import { CONFLICT, NOT_FOUND, fail } from '../../http';
import { kindParam } from '../../ticket-tracker-item';

export type ReviewTracker = {
  kind: IntegrationKindName;
  adapter: TrackerAdapter;
  /** Null when the project is not connected to the tracker. */
  access: TrackerAccess | null;
};

export function reviewTracker(
  db: Db,
  apis: IntegrationApis,
  c: Context,
  projectId: number,
): ReviewTracker {
  const kind = kindParam(c);
  const integration = integrationOf(db, projectId, kind);
  const access = integration
    ? { secret: integration.secret, config: integration.config, fields: integration.fields }
    : null;
  return { kind, adapter: trackerAdapter(kind, apis), access };
}

/** The project's access to the tracker; refused when it is not connected. */
export function requireAccess({ kind, access }: ReviewTracker): TrackerAccess {
  if (!access) {
    const { label } = integrationKind(kind);
    throw fail(
      CONFLICT,
      `Connect the project to ${label} first (Settings → Integrations → ${label})`,
    );
  }
  return access;
}

/** The linked item `itemId` of `kind`, refused when the review is not linked to it. */
export function requireLinked(
  db: Db,
  reviewId: number,
  kind: IntegrationKindName,
  itemId: string,
): string {
  const linked = linkedTrackerItems(db, { kind: 'review', id: reviewId }, kind);
  if (!linked.some((item) => item.id === itemId)) {
    throw fail(NOT_FOUND, 'The review is not linked to this item any more');
  }
  return itemId;
}
