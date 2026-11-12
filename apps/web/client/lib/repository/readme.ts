// Which file of a folder is its README, shown under the folder's entries as GitHub does.

type Entry = { path: string; type: string };

const README = /^readme(?:\.(?<ext>[a-z]+))?$/iu;
/** Markdown first, then plain text, then any other README. */
const RANK: Record<string, number> = { md: 0, markdown: 0, '': 1, txt: 1 };
const OTHER = 2;

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function rank(ext: string | undefined): number {
  return RANK[(ext ?? '').toLowerCase()] ?? OTHER;
}

/** The folder's README file, if it has one; the Markdown one when there are several. */
export function readmeOf<T extends Entry>(entries: readonly T[]): T | undefined {
  const found = entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({ entry, match: README.exec(nameOf(entry.path)) }))
    .filter((candidate) => candidate.match !== null);
  return found.toSorted((a, b) => rank(a.match?.groups?.ext) - rank(b.match?.groups?.ext))[0]
    ?.entry;
}
