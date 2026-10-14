import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDb, createTicket, migrateDb, schema } from '@union/core';

import { createApp } from './app';
import { fetchNotionImages } from './notion-images';
import { addAttachment } from './routes/attachments';

const root = await mkdtemp(path.join(tmpdir(), 'union-notion-images-'));
process.env.UNION_ATTACHMENTS_DIR = root;

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const S3 =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/image.png?X-Amz-Expires=3600&X-Amz-Signature=x';
const PNG = new Uint8Array([137, 80, 78, 71]);

function fakeFetch(answers: Record<string, Response>): typeof fetch {
  return ((input: string | URL | Request) =>
    Promise.resolve(
      answers[input instanceof Request ? input.url : input.toString()] ??
        new Response('gone', { status: 403 }),
    )) as typeof fetch;
}

test("Notion's images become ticket files; other links and failures are left as they are", async () => {
  const markdown = [
    `![](${S3})`,
    '![logo](https://example.com/logo.png)',
    `![](${S3.replace('image.png', 'gone.png')})`,
  ].join('\n');
  const result = await fetchNotionImages(
    markdown,
    fakeFetch({ [S3]: new Response(PNG, { headers: { 'content-type': 'image/png' } }) }),
  );
  expect(result.images).toEqual([
    { name: 'notion-image-1.png', bytes: PNG, contentType: 'image/png' },
  ]);
  expect(result.markdown.split('\n')).toEqual([
    '![notion-image-1.png](attachment:notion-image-1.png)',
    '![logo](https://example.com/logo.png)',
    `![](${S3.replace('image.png', 'gone.png')})`,
  ]);
});

test('anything but a raster image is not kept', async () => {
  const result = await fetchNotionImages(
    `![](${S3})`,
    fakeFetch({ [S3]: new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) }),
  );
  expect(result.images).toEqual([]);
});

test('an image file is shown inline only when asked, and only as an image', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const ticket = createTicket(db, { projectId, title: 't' });
  const image = await addAttachment(db, ticket.id, {
    name: 'notion-image-1.png',
    bytes: PNG,
    contentType: 'image/png',
  });
  const text = await addAttachment(db, ticket.id, {
    name: 'notes.html',
    bytes: new TextEncoder().encode('<script>'),
    contentType: 'text/html',
  });
  const app = createApp(db);
  const base = `/api/tickets/${ticket.id}/attachments`;
  const inline = await app.request(`${base}/${image.id}?inline`);
  expect(inline.headers.get('content-type')).toBe('image/png');
  expect(inline.headers.get('content-disposition')).toBe('inline');
  const download = await app.request(`${base}/${text.id}?inline`);
  expect(download.headers.get('content-type')).toBe('application/octet-stream');
  expect(download.headers.get('content-disposition')).toStartWith('attachment');
});
