// The user guide's pages from the files of `documentation/`: which names are pages and their
// titles. Also the order the index lists them in.
import type { GuidePage } from './guide-types';

const PAGE_FILE = /^(?<name>[a-z0-9-]+|README)\.md$/u;
const TITLE = /^# (?<title>.+)$/mu;
const INDEX_LINK = /\]\((?<name>[a-z0-9-]+)\.md[)#]/gu;

export const GUIDE_INDEX = 'README';

/** The page a file of the guide's folder is, or null for any other file. */
export function pageName(file: string): string | null {
  return PAGE_FILE.exec(file)?.groups?.name ?? null;
}

/** The page's first `# ` heading, else its name. */
export function pageTitle(name: string, text: string): string {
  return TITLE.exec(text)?.groups?.title?.trim() ?? name;
}

/** The index first, then the pages in the order the index links them, then the others by name. */
export function orderPages(pages: readonly GuidePage[], index: string): GuidePage[] {
  const linked = [...index.matchAll(INDEX_LINK)].map((match) => match.groups?.name ?? '');
  const rank = (name: string): number => {
    if (name === GUIDE_INDEX) {
      return -1;
    }
    const at = linked.indexOf(name);
    return at === -1 ? linked.length : at;
  };
  return pages.toSorted((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
