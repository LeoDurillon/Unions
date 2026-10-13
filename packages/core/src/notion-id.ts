/** A whole ID: not touching other hex characters, so slugs like `Add-feed-<id>` cannot shift it. */
const BARE_ID = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/giu;
const DASHED_ID =
  /(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/giu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const PARTS = /^(?<a>.{8})(?<b>.{4})(?<c>.{4})(?<d>.{4})(?<e>.{12})$/u;

function dashed(hex: string): string {
  return hex.toLowerCase().replace(PARTS, '$<a>-$<b>-$<c>-$<d>-$<e>');
}

/**
 * The Notion ID in a bare ID (with or without dashes) or a notion.so URL; the last ID in the URL path
 * wins, since slugs put it at the end. Null when there is none.
 */
export function parseNotionId(input: string): string | null {
  const text = input.trim();
  if (UUID.test(text)) {
    return text.toLowerCase();
  }
  const path = text.split(/[?#]/u)[0] ?? '';
  const matches = [...path.matchAll(BARE_ID), ...path.matchAll(DASHED_ID)].toSorted(
    (a, b) => a.index - b.index,
  );
  const last = matches.at(-1)?.[0];
  return last ? dashed(last.replaceAll('-', '')) : null;
}
