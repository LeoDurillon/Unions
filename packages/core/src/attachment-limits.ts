/** Upload limits, shared by the server and the browser (which checks them before sending). */

const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;
const MAX_FILE_MIB = 25;
const MAX_TICKET_MIB = 100;
export const MAX_ATTACHMENT_BYTES = MAX_FILE_MIB * MEBIBYTE;
export const MAX_TICKET_ATTACHMENT_BYTES = MAX_TICKET_MIB * MEBIBYTE;

/** `512 B`, `12.3 KB`, `4.0 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < KIBIBYTE) {
    return `${bytes} B`;
  }
  if (bytes < MEBIBYTE) {
    return `${(bytes / KIBIBYTE).toFixed(1)} KB`;
  }
  return `${(bytes / MEBIBYTE).toFixed(1)} MB`;
}
