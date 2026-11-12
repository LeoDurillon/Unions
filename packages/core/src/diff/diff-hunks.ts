// A file's patch as hunks: the grouping by spec places hunks, the review page shows some of them.
// Pure and browser-safe. A hunk is named by its header's start lines (`-12+14`), the same in a
// ticket's stored diff and in GitHub's patch of a pull request.

export type Hunk = {
  key: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The `@@ … @@` line, with the enclosing function git adds after it. */
  header: string;
  additions: number;
  deletions: number;
};

const HUNK_HEADER =
  /^@@ -(?<old>\d+)(?:,(?<oldLines>\d+))? \+(?<new>\d+)(?:,(?<newLines>\d+))? @@/u;

/** A cited line this far from every hunk still names the nearest one: diffs can differ by context. */
const NEAR_LINES = 3;

export function hunkKey(oldStart: number, newStart: number): string {
  return `-${oldStart}+${newStart}`;
}

/** The patch's lines before its first hunk (file headers), and each hunk with its own lines. */
function split(patch: string): { head: string[]; blocks: { hunk: Hunk; lines: string[] }[] } {
  const head: string[] = [];
  const blocks: { hunk: Hunk; lines: string[] }[] = [];
  for (const line of patch.split('\n')) {
    const match = HUNK_HEADER.exec(line)?.groups;
    if (match) {
      const oldStart = Number(match.old);
      const newStart = Number(match.new);
      blocks.push({
        hunk: {
          key: hunkKey(oldStart, newStart),
          oldStart,
          oldLines: Number(match.oldLines ?? '1'),
          newStart,
          newLines: Number(match.newLines ?? '1'),
          header: line,
          additions: 0,
          deletions: 0,
        },
        lines: [line],
      });
    } else {
      const block = blocks.at(-1);
      if (block) {
        block.lines.push(line);
        block.hunk.additions += line.startsWith('+') ? 1 : 0;
        block.hunk.deletions += line.startsWith('-') ? 1 : 0;
      } else {
        head.push(line);
      }
    }
  }
  return { head, blocks };
}

export function hunksOf(patch: string): Hunk[] {
  return split(patch).blocks.map((block) => block.hunk);
}

/** The patch with only the hunks named in `keys`; their headers keep the line numbers right. */
export function keepHunks(patch: string, keys: ReadonlySet<string>): string {
  const { head, blocks } = split(patch);
  return [
    ...head,
    ...blocks.filter((block) => keys.has(block.hunk.key)).flatMap((block) => block.lines),
  ].join('\n');
}

/** How far `line` is from the hunk's new side (0 inside it; a deletion-only hunk sits at its start). */
function distance(hunk: Hunk, line: number): number {
  const last = hunk.newStart + Math.max(hunk.newLines, 1) - 1;
  if (line < hunk.newStart) {
    return hunk.newStart - line;
  }
  return line > last ? line - last : 0;
}

/**
 * The hunk a line of the new file falls in, as an agent cites it from its own `git diff`: inside a
 * hunk, else the nearest one within a few lines (hunk boundaries vary with the diff's context).
 */
export function hunkAt(hunks: readonly Hunk[], line: number): Hunk | null {
  let best: { hunk: Hunk; distance: number } | null = null;
  for (const hunk of hunks) {
    const away = distance(hunk, line);
    if (away <= NEAR_LINES && (best === null || away < best.distance)) {
      best = { hunk, distance: away };
    }
  }
  return best?.hunk ?? null;
}
