// Finds files by a few typed letters, like an editor's "go to file": the letters in order, anywhere in the path.
import { nameOf } from './repo-tree';

/** Shown at most, best first. */
export const FILTER_LIMIT = 200;

/** A match inside the file name beats any match spread over the folders. */
const IN_NAME = 1_000_000;
const AT_WORD_START = 10;
const GAP_COST = 1;

function isWordStart(text: string, index: number): boolean {
  const before = text[index - 1];
  return index === 0 || before === '/' || before === '-' || before === '_' || before === '.';
}

/** The letters found in order in the text, greedily; null when one is missing. */
function matchScore(text: string, letters: string): number | null {
  let score = 0;
  let from = 0;
  for (const letter of letters) {
    const index = text.indexOf(letter, from);
    if (index === -1) {
      return null;
    }
    score += (isWordStart(text, index) ? AT_WORD_START : 0) - (index - from) * GAP_COST;
    from = index + 1;
  }
  return score;
}

/**
 * How well the path matches the letters in order (case ignored); null when it does not. All of them in the
 * file name scores higher, then letters at the start of a word and close together.
 */
export function pathScore(path: string, query: string): number | null {
  const letters = query.toLowerCase().replaceAll(' ', '');
  const lower = path.toLowerCase();
  const inName = matchScore(nameOf(lower), letters);
  return inName === null ? matchScore(lower, letters) : IN_NAME + inName;
}

/** The paths matching the query, best first, then the shorter file name, then the shorter path; at most `FILTER_LIMIT`. */
export function filterPaths(paths: string[], query: string): string[] {
  if (query.trim() === '') {
    return [];
  }
  return paths
    .flatMap((path) => {
      const score = pathScore(path, query);
      return score === null ? [] : [{ path, score, name: nameOf(path).length }];
    })
    .toSorted((a, b) => b.score - a.score || a.name - b.name || a.path.length - b.path.length)
    .slice(0, FILTER_LIMIT)
    .map(({ path }) => path);
}
