// The screenshots kept from a ticket's last e2e run: ticket files the next run replaces.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { and, eq } from 'drizzle-orm';

import { gitBlobId, safeFileName, ticketAttachmentsDir, uniqueFileName } from './attachments';
import type { Db } from './db';
import * as schema from './tables';
import { emitEvent } from './tickets';

/** Marks the files Union keeps from the last e2e run: the next run replaces them. */
export const E2E_SCREENSHOT_NOTE = 'Screenshot of a failing end-to-end test, kept by Union';

/**
 * Replaces the ticket's e2e screenshots with `files` (none: just removes them). They are ticket files
 * like the user's (copied to the agents' attachments folder, read by the final review), private:
 * never allowed in the repository.
 */
export async function replaceE2eScreenshots(
  db: Db,
  ticketId: number,
  files: { name: string; bytes: Uint8Array }[],
): Promise<void> {
  const dir = ticketAttachmentsDir(ticketId);
  const old = db
    .select()
    .from(schema.ticketAttachments)
    .where(
      and(
        eq(schema.ticketAttachments.ticketId, ticketId),
        eq(schema.ticketAttachments.note, E2E_SCREENSHOT_NOTE),
      ),
    )
    .all();
  for (const row of old) {
    await rm(path.join(dir, row.name), { force: true });
    db.delete(schema.ticketAttachments).where(eq(schema.ticketAttachments.id, row.id)).run();
  }
  const taken = new Set(
    db
      .select({ name: schema.ticketAttachments.name })
      .from(schema.ticketAttachments)
      .where(eq(schema.ticketAttachments.ticketId, ticketId))
      .all()
      .map((row) => row.name),
  );
  await mkdir(dir, { recursive: true });
  for (const file of files) {
    const name = uniqueFileName(safeFileName(`e2e-${file.name}`), taken);
    taken.add(name);
    await writeFile(path.join(dir, name), file.bytes);
    db.insert(schema.ticketAttachments)
      .values({
        ticketId,
        name,
        size: file.bytes.byteLength,
        contentType: 'image/png',
        note: E2E_SCREENSHOT_NOTE,
        allowInRepo: false,
        blobId: gitBlobId(file.bytes),
      })
      .run();
  }
  if (old.length > 0 || files.length > 0) {
    emitEvent(db, { type: 'e2e_screenshots', ticketId, payload: { count: files.length } });
  }
}
