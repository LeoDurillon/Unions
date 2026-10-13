import path from 'node:path';

import { and, eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

export type Attachment = typeof schema.ticketAttachments.$inferSelect;

export * from './attachment-limits';

const MAX_NAME_LENGTH = 120;

/** Where the agents find a ticket's files: next to the repository, so `git add -A` never sees them. */
export const CONTAINER_ATTACHMENTS_DIR = '/workspace/attachments';

/** Gitignored, next to `union.sqlite`; the web and the worker see the same folder. */
export const DEFAULT_ATTACHMENTS_DIR = path.resolve(
  import.meta.dir,
  '..',
  '..',
  '..',
  'attachments',
);

/** Read on each call, so tests can point it to a temporary folder. */
export function attachmentsRoot(): string {
  return process.env.UNION_ATTACHMENTS_DIR ?? DEFAULT_ATTACHMENTS_DIR;
}

/** The host folder holding one ticket's files, under the names the agents see. */
export function ticketAttachmentsDir(ticketId: number): string {
  return path.join(attachmentsRoot(), `t${ticketId}`);
}

/** A plain file name: no folders, no control or shell-special characters, never empty or dotted. */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/u).at(-1) ?? '';
  const cleaned = base
    .replaceAll(/[^\w.\- ()+@,]/gu, '_')
    .replace(/^[.\s]+/u, '')
    .trim()
    .slice(-MAX_NAME_LENGTH);
  return cleaned === '' ? 'file' : cleaned;
}

/** `name`, else `name (2)`, `name (3)`… before the extension, whichever is not taken yet. */
export function uniqueFileName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let count = 2;
  while (taken.has(`${stem} (${count})${extension}`)) {
    count += 1;
  }
  return `${stem} (${count})${extension}`;
}

/** The id git gives the file's content (SHA-1 object format), found in a pushed branch if committed. */
export function gitBlobId(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher('sha1');
  hasher.update(`blob ${bytes.byteLength}\0`);
  hasher.update(bytes);
  return hasher.digest('hex');
}

export function listAttachments(db: Db, ticketId: number): Attachment[] {
  return db
    .select()
    .from(schema.ticketAttachments)
    .where(eq(schema.ticketAttachments.ticketId, ticketId))
    .orderBy(schema.ticketAttachments.id)
    .all();
}

export function findAttachment(db: Db, ticketId: number, id: number): Attachment | undefined {
  return db
    .select()
    .from(schema.ticketAttachments)
    .where(
      and(eq(schema.ticketAttachments.ticketId, ticketId), eq(schema.ticketAttachments.id, id)),
    )
    .get();
}

/** The files a push must not contain: those the user did not allow in the repository. */
export function privateAttachments(db: Db, ticketId: number): Attachment[] {
  return listAttachments(db, ticketId).filter((attachment) => !attachment.allowInRepo);
}
