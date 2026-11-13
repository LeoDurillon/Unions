// Links the tickets imported from Notion before the link was stored to their page, from their description's line.

import { and, eq, isNotNull, isNull, like } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';
import { parseNotionId } from './notion-id';

const IMPORTED = /^Imported from Notion: (?<url>\S+)\s*$/mu;

/**
 * Links the tickets imported from Notion before the link was stored to their page, from the line
 * the import wrote at the end of their description. Returns how many were linked.
 */
export function backfillNotionPages(db: Db): number {
  const candidates = db
    .select()
    .from(schema.tickets)
    .where(
      and(
        isNull(schema.tickets.originKind),
        isNotNull(schema.tickets.body),
        like(schema.tickets.body, '%Imported from Notion: %'),
      ),
    )
    .all();
  let linked = 0;
  for (const ticket of candidates) {
    const url = [...ticket.body.matchAll(new RegExp(IMPORTED, 'gmu'))].at(-1)?.groups?.url;
    const pageId = url ? parseNotionId(url) : null;
    if (pageId) {
      db.update(schema.tickets)
        .set({ originKind: 'notion', originId: pageId, originUrl: url })
        .where(eq(schema.tickets.id, ticket.id))
        .run();
      linked += 1;
    }
  }
  return linked;
}
