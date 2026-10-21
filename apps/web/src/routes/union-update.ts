// `/api/union-update`: how far Union's checkout is behind `origin/main`, and the commands that check again and update (the worker does both).
import { activeWork, readUnionUpdate, schema, type Db } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, readObject } from '../http';
import type { UnionUpdateView } from '../union-update-types';

function viewOf(db: Db): UnionUpdateView {
  const row = readUnionUpdate(db);
  return {
    update: row && {
      localSha: row.localSha,
      remoteSha: row.remoteSha,
      ahead: row.ahead,
      behind: row.behind,
      subjects: row.subjects,
      migrations: row.migrations,
      refusal: row.refusal,
      status: row.status,
      error: row.error,
      checkedAt: row.checkedAt,
    },
    active: activeWork(db),
  };
}

export function unionUpdateRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(viewOf(db)));
  routes.post('/check', (c) => {
    db.insert(schema.commands).values({ type: 'union_update_check' }).run();
    return c.json(viewOf(db), ACCEPTED);
  });
  /** `{ force: true }` updates even while work is in progress (the restart interrupts it). */
  routes.post('/', async (c) => {
    const body = await readObject(c.req.raw);
    const force = body.force === true;
    db.insert(schema.commands).values({ type: 'union_update', payload: { force } }).run();
    return c.json(viewOf(db), ACCEPTED);
  });
  return routes;
}
