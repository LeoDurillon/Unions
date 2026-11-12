// Small readers of Notion's JSON: an object check, and rich text as plain text.

/** Rich text arrays to plain text; anything unexpected reads as empty. */
export function plain(texts: unknown): string {
  if (!Array.isArray(texts)) {
    return '';
  }
  return texts
    .map((text: unknown) =>
      isRecord(text) && typeof text.plain_text === 'string' ? text.plain_text : '',
    )
    .join('');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
