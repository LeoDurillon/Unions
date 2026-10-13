import { latestRefusal, type Db } from '@union/core';
import type { Context } from 'hono';

import { requireId } from '../http';

/** The ticket's last refused commit (null if none): what the user decides on while the run is paused. */
export function refusedCommit(db: Db, c: Context): Response {
  const id = requireId(c.req.param('id'), 'ticket id');
  return c.json(latestRefusal(db, id) ?? null);
}
