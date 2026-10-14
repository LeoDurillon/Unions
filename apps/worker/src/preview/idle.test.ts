import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, updatePreview, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { IdleWatcher, readProxyMetrics, requestsByTicket } from './idle';

const MINUTE = 60_000;

let db: Db;
let ticketId: number;
let metrics: string | null;
let stopped: { ticketId: number; minutes: number }[];
let testing: number | null;

function line(ticket: number, service: string, count: number): string {
  return `traefik_router_requests_total{code="200",method="GET",protocol="http",router="union-t${ticket}-${service}@docker",service="union-t${ticket}-${service}@docker"} ${count}`;
}

function watcher(): IdleWatcher {
  return new IdleWatcher({
    db,
    readMetrics: () => Promise.resolve(metrics),
    stopIdle: (id, minutes) => {
      stopped.push({ ticketId: id, minutes });
    },
    testing: () => testing,
  });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      config: {
        baseBranch: 'main',
        preview: { composeFile: 'c.yml', env: {}, idleStopMinutes: 30 },
      },
    })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 't' }).id;
  updatePreview(db, ticketId, { status: 'running', startedAt: 0 });
  metrics = line(ticketId, 'web', 5);
  stopped = [];
  testing = null;
});

test("each ticket's requests are summed over its services", () => {
  const text = [line(3, 'web', 2), line(3, 'api', 5), line(12, 'web', 1), 'traefik_other 9'].join(
    '\n',
  );
  expect([...requestsByTicket(text)]).toEqual([
    [3, 7],
    [12, 1],
  ]);
});

test('a preview nobody visits stops after the idle time; a visit starts the clock again', async () => {
  const idle = watcher();
  await idle.check(0);
  await idle.check(29 * MINUTE);
  expect(stopped).toEqual([]);
  metrics = line(ticketId, 'web', 6);
  await idle.check(29 * MINUTE);
  await idle.check(58 * MINUTE);
  expect(stopped).toEqual([]);
  await idle.check(59 * MINUTE);
  expect(stopped).toEqual([{ ticketId, minutes: 30 }]);
});

test('never while the agent runs a step or its e2e tests run, nor with 0 minutes', async () => {
  const idle = watcher();
  await idle.check(0);
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await idle.check(40 * MINUTE);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  testing = ticketId;
  await idle.check(80 * MINUTE);
  testing = null;
  expect(stopped).toEqual([]);
  db.update(schema.projects)
    .set({
      config: {
        baseBranch: 'main',
        preview: { composeFile: 'c.yml', env: {}, idleStopMinutes: 0 },
      },
    })
    .run();
  await idle.check(500 * MINUTE);
  expect(stopped).toEqual([]);
});

test("without the proxy's metrics nothing stops", async () => {
  const idle = watcher();
  await idle.check(0);
  metrics = null;
  await idle.check(500 * MINUTE);
  expect(stopped).toEqual([]);
  expect(await readProxyMetrics('')).toBeNull();
  expect(
    await readProxyMetrics('http://proxy/metrics', (() =>
      Promise.reject(new Error('down'))) as unknown as typeof fetch),
  ).toBeNull();
});
