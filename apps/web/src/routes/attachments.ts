import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  attachmentsRoot,
  emitEvent,
  findAttachment,
  gitBlobId,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  MAX_TICKET_ATTACHMENT_BYTES,
  safeFileName,
  schema,
  ticketAttachmentsDir,
  uniqueFileName,
  formatBytes,
  type Attachment,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { BAD_REQUEST, CREATED, fail, NOT_FOUND, readObject, requireId } from '../http';
import { findTicket } from './ticket-links';

const NO_CONTENT = 204;
const PAYLOAD_TOO_LARGE = 413;
/** Room for the multipart envelope and the note around the file itself. */
const ENVELOPE_BYTES = 65_536;
const MAX_NOTE_LENGTH = 2000;

function ticketIdOf(db: Db, c: Context): number {
  const id = requireId(c.req.param('id'), 'ticket id');
  if (!findTicket(db)(id)) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  return id;
}

function attachmentOf(db: Db, c: Context): Attachment {
  const ticketId = ticketIdOf(db, c);
  const attachment = findAttachment(
    db,
    ticketId,
    requireId(c.req.param('attachmentId'), 'attachment id'),
  );
  if (!attachment) {
    throw fail(NOT_FOUND, 'Attachment not found');
  }
  return attachment;
}

function noteOf(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string' || value.length > MAX_NOTE_LENGTH) {
    throw fail(BAD_REQUEST, `"note" must be a string of at most ${MAX_NOTE_LENGTH} characters`);
  }
  return value.trim();
}

function checkSize(db: Db, ticketId: number, size: number): void {
  if (size > MAX_ATTACHMENT_BYTES) {
    throw fail(PAYLOAD_TOO_LARGE, `A file can be at most ${formatBytes(MAX_ATTACHMENT_BYTES)}`);
  }
  const used = listAttachments(db, ticketId).reduce((sum, row) => sum + row.size, 0);
  if (used + size > MAX_TICKET_ATTACHMENT_BYTES) {
    throw fail(
      PAYLOAD_TOO_LARGE,
      `A ticket's files can total at most ${formatBytes(MAX_TICKET_ATTACHMENT_BYTES)} (${formatBytes(used)} used)`,
    );
  }
}

/** Written aside first, then moved in: the ticket's folder only ever holds complete files. */
async function store(ticketId: number, name: string, bytes: Uint8Array): Promise<void> {
  const incoming = path.join(attachmentsRoot(), '.incoming');
  await mkdir(incoming, { recursive: true });
  const dir = ticketAttachmentsDir(ticketId);
  await mkdir(dir, { recursive: true });
  const temporary = path.join(incoming, `${ticketId}-${crypto.randomUUID()}`);
  await Bun.write(temporary, bytes);
  await rename(temporary, path.join(dir, name));
}

async function upload(db: Db, c: Context): Promise<Response> {
  const ticketId = ticketIdOf(db, c);
  const form = await c.req.parseBody();
  const { file } = form;
  if (!(file instanceof File)) {
    throw fail(BAD_REQUEST, 'Expected a "file" field');
  }
  checkSize(db, ticketId, file.size);
  const taken = new Set(listAttachments(db, ticketId).map((row) => row.name));
  const name = uniqueFileName(safeFileName(file.name), taken);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await store(ticketId, name, bytes);
  try {
    const attachment = db
      .insert(schema.ticketAttachments)
      .values({
        ticketId,
        name,
        size: bytes.byteLength,
        contentType: file.type === '' ? 'application/octet-stream' : file.type,
        note: noteOf(form.note),
        allowInRepo: form.allowInRepo === 'true',
        blobId: gitBlobId(bytes),
      })
      .returning()
      .get();
    emitEvent(db, { type: 'attachment_added', ticketId, payload: { id: attachment.id, name } });
    return c.json(attachment, CREATED);
  } catch (error) {
    await rm(path.join(ticketAttachmentsDir(ticketId), name), { force: true });
    throw error;
  }
}

async function update(db: Db, c: Context): Promise<Response> {
  const attachment = attachmentOf(db, c);
  const body = await readObject(c.req.raw);
  const change: Partial<Pick<Attachment, 'note' | 'allowInRepo'>> = {};
  if ('note' in body) {
    change.note = noteOf(body.note);
  }
  if ('allowInRepo' in body) {
    if (typeof body.allowInRepo !== 'boolean') {
      throw fail(BAD_REQUEST, '"allowInRepo" must be a boolean');
    }
    change.allowInRepo = body.allowInRepo;
  }
  const updated = db
    .update(schema.ticketAttachments)
    .set(change)
    .where(eq(schema.ticketAttachments.id, attachment.id))
    .returning()
    .get();
  emitEvent(db, {
    type: 'attachment_updated',
    ticketId: attachment.ticketId,
    payload: { id: attachment.id, ...change },
  });
  return c.json(updated);
}

async function remove(db: Db, c: Context): Promise<Response> {
  const attachment = attachmentOf(db, c);
  db.delete(schema.ticketAttachments).where(eq(schema.ticketAttachments.id, attachment.id)).run();
  await rm(path.join(ticketAttachmentsDir(attachment.ticketId), attachment.name), { force: true });
  emitEvent(db, {
    type: 'attachment_removed',
    ticketId: attachment.ticketId,
    payload: { id: attachment.id, name: attachment.name },
  });
  return c.body(null, NO_CONTENT);
}

/** Always a download, never rendered: the file is whatever the user uploaded. */
function download(db: Db, c: Context): Response {
  const attachment = attachmentOf(db, c);
  const file = Bun.file(path.join(ticketAttachmentsDir(attachment.ticketId), attachment.name));
  return new Response(file, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Under `/api/tickets/:id/attachments`. */
export function attachmentRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listAttachments(db, ticketIdOf(db, c))));
  routes.post(
    '/',
    bodyLimit({
      maxSize: MAX_ATTACHMENT_BYTES + ENVELOPE_BYTES,
      onError: () => {
        throw fail(PAYLOAD_TOO_LARGE, `A file can be at most ${formatBytes(MAX_ATTACHMENT_BYTES)}`);
      },
    }),
    (c) => upload(db, c),
  );
  routes.patch('/:attachmentId', (c) => update(db, c));
  routes.delete('/:attachmentId', (c) => remove(db, c));
  routes.get('/:attachmentId', (c) => download(db, c));
  return routes;
}

/** Deletes the files of tickets that are gone (their rows went with them, by cascade). */
export async function removeTicketFiles(ticketIds: number[]): Promise<void> {
  await Promise.all(
    ticketIds.map((id) => rm(ticketAttachmentsDir(id), { recursive: true, force: true })),
  );
}
