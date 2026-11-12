// The diff a review agent's `path:line` reference opens: a changed file, at some lines of its new version; browser-safe.

/** Lines of the new version, both ends included. */
type LinkLines = { start: number; end: number };

/** A changed file, and the lines to open it at (null: the file from its top). */
export type DiffLink = { path: string; lines: LinkLines | null };

/** `path`, `path:12`, `path:12-30` (or an en dash, or `L12-L30`); no spaces in the path. */
const REFERENCE = /^(?<path>[^\s:]+)(?::L?(?<start>\d+)(?:[-–]L?(?<end>\d+))?)?$/u;

function linesOf(start: string | undefined, end: string | undefined): LinkLines | null {
  if (start === undefined) {
    return null;
  }
  const first = Number(start);
  const last = end === undefined ? first : Number(end);
  if (first < 1 || last < 1) {
    return null;
  }
  return { start: Math.min(first, last), end: Math.max(first, last) };
}

/**
 * The link an inline code span makes, when it names one of `changed` (paths from the repository's
 * root; a leading `./` is dropped); null for any other text, which stays plain code.
 */
export function diffLinkOf(text: string, changed: ReadonlySet<string>): DiffLink | null {
  const match = REFERENCE.exec(text.trim());
  const path = match?.groups?.path?.replace(/^\.\//u, '');
  if (!match?.groups || path === undefined || !changed.has(path)) {
    return null;
  }
  return { path, lines: linesOf(match.groups.start, match.groups.end) };
}
