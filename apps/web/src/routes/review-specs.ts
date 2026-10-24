// Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
// `/specs`, the review's specs, started the first time, each read from its source unless edited;
// `PUT /specs` saves the list as the Specs bar edits it.
import {
  parseNotionId,
  parseSavedSpecs,
  reviewSpecRows,
  saveReviewSpecs,
  schema,
  startReviewSpecs,
  type Db,
  type ReviewSpecRow,
  type SavedSpecEntry,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, fail, readObject } from '../http';
import type { ReviewSpecView } from '../review-spec-types';
import type { GroupingTarget } from './review-groupings';
import { readSpec, type SpecReaders } from './spec-sources';

/** The label and URL as read now, kept on the row so the bar lists them without reading again. */
function refreshSnapshot(db: Db, row: ReviewSpecRow, label: string, url: string | null): void {
  if (label !== row.label || url !== row.url) {
    db.update(schema.reviewSpecs)
      .set({ label, url })
      .where(eq(schema.reviewSpecs.id, row.id))
      .run();
  }
}

async function viewOf(
  readers: SpecReaders,
  target: GroupingTarget,
  row: ReviewSpecRow,
): Promise<ReviewSpecView> {
  const { kind, ref, label, url, text, removed } = row;
  const saved = { kind, ref, label, url, text, removed };
  if (removed || text !== null) {
    return { ...saved, current: removed ? null : text, error: null };
  }
  try {
    const read = await readSpec(readers, target, kind, ref ?? '');
    const readUrl = read.url ?? url;
    refreshSnapshot(readers.db, row, read.label, readUrl);
    return { ...saved, label: read.label, url: readUrl, current: read.text, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...saved, current: null, error: message };
  }
}

function views(
  readers: SpecReaders,
  target: GroupingTarget,
  rows: ReviewSpecRow[],
): Promise<ReviewSpecView[]> {
  return Promise.all(rows.map((row) => viewOf(readers, target, row)));
}

/** A Notion spec names its page by id, as a link does (the dialog may send the page's URL). */
function withPageId(spec: SavedSpecEntry): SavedSpecEntry {
  if (spec.kind !== 'notion') {
    return spec;
  }
  const id = parseNotionId(spec.ref ?? '');
  if (!id) {
    throw fail(BAD_REQUEST, `${spec.label}: give a Notion page URL or ID`);
  }
  return { ...spec, ref: id };
}

async function save(readers: SpecReaders, target: GroupingTarget, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  const parsed = parseSavedSpecs(body.specs);
  if ('error' in parsed) {
    throw fail(BAD_REQUEST, parsed.error);
  }
  saveReviewSpecs(
    readers.db,
    target.owner,
    parsed.specs.map((spec) => withPageId(spec)),
  );
  // Read back as saved: a list emptied of its starts keeps them removed, never added back.
  return c.json(await views(readers, target, reviewSpecRows(readers.db, target.owner)));
}

/** `GET /` the list, `PUT /` the list as saved. */
export function reviewSpecRoutes(
  readers: SpecReaders,
  targetOf: (c: Context) => GroupingTarget,
): Hono {
  const routes = new Hono();
  routes.get('/', async (c) => {
    const target = targetOf(c);
    return c.json(
      await views(readers, target, startReviewSpecs(readers.db, target.owner, target.starts)),
    );
  });
  routes.put('/', (c) => save(readers, targetOf(c), c));
  return routes;
}
