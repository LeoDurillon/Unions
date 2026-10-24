// A review's specs in the database: the list (started with its sources the first time), saving the
// user's list, and the Notion pages linked to it (its `notion` specs).
import { and, asc, eq, max, type SQL } from 'drizzle-orm';

import type { AgentReviewOwner } from './agent-reviews';
import type { Db } from './db';
import {
  missingStarts,
  sameSource,
  type SavedSpecEntry,
  type SpecEntry,
} from './review-spec-lists';
import type { ReviewSpecRow } from './schema-review-specs';
import * as schema from './tables';

export type { ReviewSpecRow } from './schema-review-specs';

/** A Notion page linked to a review. */
export type LinkedPage = { id: string; title: string; url: string | null };

const NOTION_PREFIX = 'Notion: ';

function owns(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.reviewSpecs.ticketId, owner.id)
    : eq(schema.reviewSpecs.reviewId, owner.id);
}

function ownerColumns(owner: AgentReviewOwner): {
  ticketId: number | null;
  reviewId: number | null;
} {
  return owner.kind === 'ticket'
    ? { ticketId: owner.id, reviewId: null }
    : { ticketId: null, reviewId: owner.id };
}

/** Every spec row of the review, removed ones too, in the list's order. */
export function reviewSpecRows(db: Db, owner: AgentReviewOwner): ReviewSpecRow[] {
  return db
    .select()
    .from(schema.reviewSpecs)
    .where(owns(owner))
    .orderBy(asc(schema.reviewSpecs.position), asc(schema.reviewSpecs.id))
    .all();
}

/** Adds the starting specs the list never had, before the others; returns the rows. */
export function startReviewSpecs(
  db: Db,
  owner: AgentReviewOwner,
  starts: SpecEntry[],
): ReviewSpecRow[] {
  const rows = reviewSpecRows(db, owner);
  const missing = missingStarts(rows, starts);
  if (missing.length === 0) {
    return rows;
  }
  const first = rows[0]?.position ?? 0;
  const { ticketId, reviewId } = ownerColumns(owner);
  db.insert(schema.reviewSpecs)
    .values(
      missing.map((entry, index) => ({
        ticketId,
        reviewId,
        kind: entry.kind,
        ref: entry.ref,
        label: entry.label,
        url: entry.url,
        position: first - missing.length + index,
      })),
    )
    .run();
  return reviewSpecRows(db, owner);
}

/** Replaces the list with the user's, in its order. */
export function saveReviewSpecs(db: Db, owner: AgentReviewOwner, specs: SavedSpecEntry[]): void {
  const { ticketId, reviewId } = ownerColumns(owner);
  db.transaction((tx) => {
    tx.delete(schema.reviewSpecs).where(owns(owner)).run();
    if (specs.length > 0) {
      tx.insert(schema.reviewSpecs)
        .values(
          specs.map((spec, position) => ({
            ticketId,
            reviewId,
            kind: spec.kind,
            ref: spec.ref,
            label: spec.label,
            url: spec.url,
            text: spec.text,
            removed: spec.removed,
            position,
          })),
        )
        .run();
    }
  });
}

/** The Notion pages linked to the review: its `notion` specs not removed. */
export function linkedNotionPages(db: Db, owner: AgentReviewOwner): LinkedPage[] {
  return reviewSpecRows(db, owner).flatMap((row) =>
    row.kind === 'notion' && !row.removed && row.ref !== null
      ? [{ id: row.ref, title: pageTitle(row.label), url: row.url }]
      : [],
  );
}

/** A Notion spec's label (`Notion: <title>`) for a page. */
function notionLabel(title: string): string {
  return `${NOTION_PREFIX}${title}`;
}

function pageTitle(label: string): string {
  return label.startsWith(NOTION_PREFIX) ? label.slice(NOTION_PREFIX.length) : label;
}

/** Links a page: its spec added at the end, or back if it was removed, with the title as read now. */
export function linkNotionPage(db: Db, owner: AgentReviewOwner, page: LinkedPage): void {
  const entry = { kind: 'notion' as const, ref: page.id };
  const row = reviewSpecRows(db, owner).find((candidate) => sameSource(candidate, entry));
  if (row) {
    db.update(schema.reviewSpecs)
      .set({ removed: false, label: notionLabel(page.title), url: page.url })
      .where(eq(schema.reviewSpecs.id, row.id))
      .run();
    return;
  }
  const last = db
    .select({ position: max(schema.reviewSpecs.position) })
    .from(schema.reviewSpecs)
    .where(owns(owner))
    .get();
  db.insert(schema.reviewSpecs)
    .values({
      ...ownerColumns(owner),
      ...entry,
      label: notionLabel(page.title),
      url: page.url,
      position: (last?.position ?? 0) + 1,
    })
    .run();
}

/** Unlinks a page: its spec is removed (kept removed, so a ticket's origin page is not added back). */
export function unlinkNotionPage(db: Db, owner: AgentReviewOwner, pageId: string): void {
  db.update(schema.reviewSpecs)
    .set({ removed: true })
    .where(
      and(owns(owner), eq(schema.reviewSpecs.kind, 'notion'), eq(schema.reviewSpecs.ref, pageId)),
    )
    .run();
}
