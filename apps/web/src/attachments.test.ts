import { afterAll, beforeEach, expect, test } from 'bun:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  MAX_ATTACHMENT_BYTES,
  migrateDb,
  schema,
  ticketAttachmentsDir,
  type Attachment,
  type Db,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';

const root = await mkdtemp(path.join(tmpdir(), 'union-attachments-'));
process.env.UNION_ATTACHMENTS_DIR = root;

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Import fails' }).id;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

function upload(
  file: File,
  fields: Record<string, string> = {},
  id = ticketId,
): Response | Promise<Response> {
  const form = new FormData();
  form.set('file', file);
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return app.request(`/api/tickets/${id}/attachments`, { method: 'POST', body: form });
}

test('an uploaded file is stored under its name, listed, downloadable, then removed', async () => {
  const created = await upload(new File(['a;b\n1;2\n'], 'orders.csv', { type: 'text/csv' }), {
    note: 'the import fails on line 2',
  });
  expect(created.status).toBe(201);
  const attachment = (await created.json()) as Attachment;
  expect(attachment).toMatchObject({
    name: 'orders.csv',
    size: 8,
    contentType: 'text/csv',
    note: 'the import fails on line 2',
    allowInRepo: false,
  });
  const stored = path.join(ticketAttachmentsDir(ticketId), 'orders.csv');
  expect(await readFile(stored, 'utf8')).toBe('a;b\n1;2\n');

  const again = (await (await upload(new File(['x'], 'orders.csv'))).json()) as Attachment;
  expect(again.name).toBe('orders (2).csv');

  const list = (await (
    await app.request(`/api/tickets/${ticketId}/attachments`)
  ).json()) as Attachment[];
  expect(list.map((row) => row.name)).toEqual(['orders.csv', 'orders (2).csv']);

  const download = await app.request(`/api/tickets/${ticketId}/attachments/${attachment.id}`);
  expect(download.headers.get('content-type')).toBe('application/octet-stream');
  expect(download.headers.get('content-disposition')).toContain('attachment');
  expect(await download.text()).toBe('a;b\n1;2\n');

  const patched = await app.request(`/api/tickets/${ticketId}/attachments/${attachment.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ allowInRepo: true, note: 'fixture' }),
  });
  expect(await patched.json()).toMatchObject({ allowInRepo: true, note: 'fixture' });

  const removed = await app.request(`/api/tickets/${ticketId}/attachments/${attachment.id}`, {
    method: 'DELETE',
  });
  expect(removed.status).toBe(204);
  expect(await exists(stored)).toBe(false);
  const events = db.select().from(schema.events).all();
  expect(events.map((event) => event.type)).toEqual([
    'ticket_created',
    'attachment_added',
    'attachment_added',
    'attachment_updated',
    'attachment_removed',
  ]);
});

test('too large files, missing files and unknown tickets are refused', async () => {
  const big = await upload(new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.bin'));
  expect(big.status).toBe(413);
  const empty = await app.request(`/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    body: new FormData(),
  });
  expect(empty.status).toBe(400);
  expect((await upload(new File(['x'], 'a.txt'), {}, ticketId + 1)).status).toBe(404);
  expect(db.select().from(schema.ticketAttachments).all()).toHaveLength(0);
});

test('deleting the project deletes its tickets’ files', async () => {
  await upload(new File(['x'], 'a.txt'));
  const { projectId } = db.select().from(schema.tickets).get() ?? { projectId: 0 };
  const response = await app.request(`/api/projects/${projectId}`, { method: 'DELETE' });
  expect(response.status).toBe(204);
  expect(await exists(ticketAttachmentsDir(ticketId))).toBe(false);
});
