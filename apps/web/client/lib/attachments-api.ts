import type { Attachment } from '@union/core';
import { MAX_ATTACHMENT_BYTES, formatBytes } from '@union/core/attachment-limits';

import { ApiError, errorMessage, request } from './api';

/** A file picked in the browser, with what the user says about it, before it is uploaded. */
export type PendingFile = { file: File; note: string; allowInRepo: boolean };

function attachmentsPath(ticketId: number): string {
  return `/api/tickets/${ticketId}/attachments`;
}

export function attachmentUrl(attachment: Pick<Attachment, 'id' | 'ticketId'>): string {
  return `${attachmentsPath(attachment.ticketId)}/${attachment.id}`;
}

/** Why the file cannot be attached, checked before sending it; null when it can. */
export function fileProblem(file: File): string | null {
  return file.size > MAX_ATTACHMENT_BYTES
    ? `${file.name} is ${formatBytes(file.size)}: a file can be at most ${formatBytes(MAX_ATTACHMENT_BYTES)}.`
    : null;
}

async function upload(ticketId: number, pending: PendingFile): Promise<Attachment> {
  const form = new FormData();
  form.set('file', pending.file);
  form.set('note', pending.note);
  form.set('allowInRepo', String(pending.allowInRepo));
  // No content-type header: the browser sets the multipart boundary itself.
  const response = await fetch(attachmentsPath(ticketId), { method: 'POST', body: form });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.statusText), response.status);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same trust boundary as `request`: the server returns the attachment row
  return data as Attachment;
}

export const attachmentsApi = {
  list: (ticketId: number): Promise<Attachment[]> => request('GET', attachmentsPath(ticketId)),
  upload,
  /** One after the other, so a ticket's total is checked against the files sent before. */
  uploadAll: async (ticketId: number, files: PendingFile[]): Promise<void> => {
    for (const pending of files) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose, see above
      await upload(ticketId, pending);
    }
  },
  update: (
    attachment: Pick<Attachment, 'id' | 'ticketId'>,
    change: Partial<Pick<Attachment, 'note' | 'allowInRepo'>>,
  ): Promise<Attachment> => request('PATCH', attachmentUrl(attachment), change),
  remove: (attachment: Pick<Attachment, 'id' | 'ticketId'>): Promise<unknown> =>
    request('DELETE', attachmentUrl(attachment)),
};
