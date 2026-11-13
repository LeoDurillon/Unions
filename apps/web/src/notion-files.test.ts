import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDb, createTicket, fetchNotionFiles, migrateDb, schema } from '@union/core';

import { createApp } from './app';
import { addAttachment } from './routes/attachments';

const root = await mkdtemp(path.join(tmpdir(), 'union-notion-files-'));
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
  const result = await fetchNotionFiles(
    markdown,
    fakeFetch({ [S3]: new Response(PNG, { headers: { 'content-type': 'image/png' } }) }),
  );
  expect(result.files).toEqual([
    { name: 'notion-image-1.png', bytes: PNG, contentType: 'image/png', image: true },
  ]);
  expect(result.markdown.split('\n')).toEqual([
    '![notion-image-1.png](attachment:notion-image-1.png)',
    '![logo](https://example.com/logo.png)',
    `![](${S3.replace('image.png', 'gone.png')})`,
  ]);
});

test('anything but a raster image is not kept', async () => {
  const result = await fetchNotionFiles(
    `![](${S3})`,
    fakeFetch({ [S3]: new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) }),
  );
  expect(result.files).toEqual([]);
});

const PDF_URL = S3.replace('image.png', 'Cahier%20des%20charges%20%28v2%29.pdf');
const PDF = new TextEncoder().encode('%PDF-1.7');

test("Notion's files become ticket files after its images, named as uploaded", async () => {
  const doc = S3.replace('image.png', 'notes.docx');
  const markdown = [
    `[Cahier des charges](${PDF_URL})`,
    `![](${S3})`,
    `[notes.docx](${doc}) and again [the notes](${doc})`,
    '[site](https://example.com/a.pdf)',
  ].join('\n');
  const result = await fetchNotionFiles(
    markdown,
    fakeFetch({
      [PDF_URL]: new Response(PDF, { headers: { 'content-type': 'application/pdf' } }),
      [S3]: new Response(PNG, { headers: { 'content-type': 'image/png' } }),
      [doc]: new Response(PDF, {
        headers: { 'content-disposition': "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.docx" },
      }),
    }),
  );
  expect(result.files.map(({ name, contentType, image }) => [name, contentType, image])).toEqual([
    ['notion-image-1.png', 'image/png', true],
    ['Cahier_des_charges__v2_.pdf', 'application/pdf', false],
    ['r_sum_.docx', 'application/octet-stream', false],
  ]);
  expect(result.markdown.split('\n')).toEqual([
    '[Cahier des charges](attachment:Cahier_des_charges__v2_.pdf)',
    '![notion-image-1.png](attachment:notion-image-1.png)',
    '[notes.docx](attachment:r_sum_.docx) and again [the notes](attachment:r_sum_.docx)',
    '[site](https://example.com/a.pdf)',
  ]);
});

test('files of the same name are told apart; one past the size limit keeps its link', async () => {
  const other = S3.replace('/b/', '/c/').replace(
    'image.png',
    'Cahier%20des%20charges%20%28v2%29.pdf',
  );
  const big = S3.replace('image.png', 'big.zip');
  const pdf = (): Response => new Response(PDF, { headers: { 'content-type': 'application/pdf' } });
  const result = await fetchNotionFiles(
    `[a](${PDF_URL}) [b](${other}) [c](${big})`,
    fakeFetch({
      [PDF_URL]: pdf(),
      [other]: pdf(),
      [big]: new Response(PDF, { headers: { 'content-length': String(26 * 1024 * 1024) } }),
    }),
  );
  expect(result.files.map((file) => file.name)).toEqual([
    'Cahier_des_charges__v2_.pdf',
    'Cahier_des_charges__v2_-2.pdf',
  ]);
  expect(result.markdown).toEndWith(`[c](${big})`);
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

test('a ticket imported from Notion keeps its images and files, each with its note', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch({
    [S3]: new Response(PNG, { headers: { 'content-type': 'image/png' } }),
    [PDF_URL]: new Response(PDF, { headers: { 'content-type': 'application/pdf' } }),
  });
  try {
    const response = await createApp(db).request('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        title: 'Imported',
        body: `![](${S3})\n[La spec](${PDF_URL})`,
        origin: {
          kind: 'notion',
          id: '3aa71918294580298940c2394c835f34',
          url: 'https://notion.so/x',
        },
      }),
    });
    expect(response.status).toBe(201);
    const ticket = db.select().from(schema.tickets).get();
    expect(ticket?.body).toBe(
      '![notion-image-1.png](attachment:notion-image-1.png)\n[La spec](attachment:Cahier_des_charges__v2_.pdf)',
    );
    const files = db.select().from(schema.ticketAttachments).all();
    expect(files.map(({ name, note }) => [name, note])).toEqual([
      ['notion-image-1.png', 'An image of the Notion page'],
      ['Cahier_des_charges__v2_.pdf', 'A file of the Notion page'],
    ]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
