// A review's specs in the database: the list (started with its sources the first time), saving the
// user's list, and the Notion pages and Jira issues linked to it (its `notion` and `jira` specs).

import { and, asc, eq, max, type SQL } from 'drizzle-orm';

import type { AgentReviewOwner } from '../agent-reviews';
import type { Db } from '../db';
import type { ReviewSpecRow } from '../schema/schema-review-specs';
import * as schema from '../tables';
import {
  missingStarts,
  sameSource,
  type SavedSpecEntry,
  type SpecEntry,
} from './review-spec-lists';

export type { ReviewSpecRow } from '../schema/schema-review-specs';

/** A tracker's item linked to a review: a Notion page, a Jira issue (`id` its key). */
export type LinkedPage = { id: string; title: string; url: string | null };

/** The spec kinds that are a tracker's item, linked to a review. */
type TrackerSpec = 'notion' | 'jira';

const NOTION_PREFIX = 'Notion: ';
/** A Jira spec's label, as `spec-sources.ts` reads it too: `Jira: KEY summary`. */
const JIRA_PREFIX = 'Jira: ';

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

/** A review's tracker items of one kind (its `notion` or `jira` specs) not removed, their title from the label. */
function linkedItems(
  db: Db,
  owner: AgentReviewOwner,
  kind: TrackerSpec,
  prefix: string,
): LinkedPage[] {
  return reviewSpecRows(db, owner).flatMap((row) =>
    row.kind === kind && !row.removed && row.ref !== null
      ? [
          {
            id: row.ref,
            title: row.label.startsWith(prefix) ? row.label.slice(prefix.length) : row.label,
            url: row.url,
          },
        ]
      : [],
  );
}

/** Links an item: its spec added at the end, or back if it was removed, with the label as read now. */
function linkItem(
  db: Db,
  owner: AgentReviewOwner,
  { kind, item, label }: { kind: TrackerSpec; item: LinkedPage; label: string },
): void {
  const entry = { kind, ref: item.id };
  const row = reviewSpecRows(db, owner).find((candidate) => sameSource(candidate, entry));
  if (row) {
    db.update(schema.reviewSpecs)
      .set({ removed: false, label, url: item.url })
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
      label,
      url: item.url,
      position: (last?.position ?? 0) + 1,
    })
    .run();
}

/** Unlinks an item: its spec is removed (kept removed, so a ticket's origin item is not added back). */
function unlinkItem(db: Db, owner: AgentReviewOwner, kind: TrackerSpec, ref: string): void {
  db.update(schema.reviewSpecs)
    .set({ removed: true })
    .where(and(owns(owner), eq(schema.reviewSpecs.kind, kind), eq(schema.reviewSpecs.ref, ref)))
    .run();
}

/** The Notion pages linked to the review: its `notion` specs not removed. */
export function linkedNotionPages(db: Db, owner: AgentReviewOwner): LinkedPage[] {
  return linkedItems(db, owner, 'notion', NOTION_PREFIX);
}

/** Links a page: its spec added at the end, or back if it was removed, with the title as read now. */
export function linkNotionPage(db: Db, owner: AgentReviewOwner, page: LinkedPage): void {
  linkItem(db, owner, { kind: 'notion', item: page, label: `${NOTION_PREFIX}${page.title}` });
}

/** Unlinks a page: its spec is removed (kept removed, so a ticket's origin page is not added back). */
export function unlinkNotionPage(db: Db, owner: AgentReviewOwner, pageId: string): void {
  unlinkItem(db, owner, 'notion', pageId);
}

/** The Jira issues linked to the review: its `jira` specs not removed (`id` the key, `title` "KEY summary"). */
export function linkedJiraIssues(db: Db, owner: AgentReviewOwner): LinkedPage[] {
  return linkedItems(db, owner, 'jira', JIRA_PREFIX);
}

/** Links an issue (`title` "KEY summary"), as a page is. */
export function linkJiraIssue(db: Db, owner: AgentReviewOwner, issue: LinkedPage): void {
  linkItem(db, owner, { kind: 'jira', item: issue, label: `${JIRA_PREFIX}${issue.title}` });
}

export function unlinkJiraIssue(db: Db, owner: AgentReviewOwner, key: string): void {
  unlinkItem(db, owner, 'jira', key);
}
