// The text of `start..end` on one side of a file's patch; null when none of those lines is in it.
import { parsePatch, type DiffLine } from './diff';

function lineNumber(line: DiffLine, side: 'old' | 'new'): number | null {
  if (line.kind === 'context') {
    return side === 'old' ? line.oldLine : line.newLine;
  }
  if (line.kind === 'add') {
    return side === 'new' ? line.newLine : null;
  }
  return line.kind === 'del' && side === 'old' ? line.oldLine : null;
}

/** The text of `start..end` on one side of a file's patch; null when none of those lines is in it. */
export function diffExcerpt(
  patch: string,
  side: 'old' | 'new',
  start: number,
  end: number,
): string | null {
  const picked = parsePatch(patch).filter((line) => {
    const number = lineNumber(line, side);
    return number !== null && number >= start && number <= end;
  });
  return picked.length === 0
    ? null
    : picked.map((line) => ('text' in line ? line.text : '')).join('\n');
}
