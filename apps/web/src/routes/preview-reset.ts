// A preview's reset as the routes queue it: refused when it cannot happen now. It carries the data
// folders the user chose among the ones its last start found.
import { getPreview, type Db } from '@union/core';
import type { Context } from 'hono';

import { BAD_REQUEST, CONFLICT, fail, readObject } from '../http';
import { queuePreviewCommand, resetRefusal, type PreviewSubject } from './preview-subject';

/** `{ folders?: string[] }`: each one must be a data folder the preview's last start found. */
async function readFolders(db: Db, c: Context, subject: PreviewSubject): Promise<string[]> {
  const { folders = [] } = await readObject(c.req.raw);
  if (!Array.isArray(folders) || !folders.every((folder) => typeof folder === 'string')) {
    throw fail(BAD_REQUEST, '"folders" must be a list of folder names');
  }
  const known = getPreview(db, subject.owner)?.dataFolders ?? [];
  const unknown = folders.filter((folder) => !known.includes(folder));
  if (unknown.length > 0) {
    throw fail(BAD_REQUEST, `Not a data folder of the preview: ${unknown.join(', ')}`);
  }
  return [...new Set(folders)];
}

/** Queues `preview_reset` for the worker, or throws why it cannot happen now. */
export async function queueReset(db: Db, c: Context, subject: PreviewSubject): Promise<void> {
  const reason = resetRefusal(db, subject);
  if (reason !== null) {
    throw fail(CONFLICT, reason);
  }
  const folders = await readFolders(db, c, subject);
  queuePreviewCommand(db, subject.owner, 'preview_reset', folders.length > 0 ? { folders } : {});
}
