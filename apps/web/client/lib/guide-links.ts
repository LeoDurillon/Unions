// Where the guide's links and images go in the app: another page of the guide opens on the Guide page, a
// screenshot loads from the API, the code's own docs open on GitHub.

/** Union's repository, for the guide's links to the docs about its code. */
const REPO_URL = 'https://github.com/LeoDurillon/Unions/blob/main/';

const PAGE_LINK = /^(?<name>[a-z0-9-]+|README)\.md(?:#(?<anchor>[\p{L}\p{N}_-]+))?$/u;
const SCREENSHOT = /^\.\.\/docs\/screenshots\/(?<file>[a-z0-9-]+\.png)$/u;
const OUTSIDE = /^\.\.\/(?<path>[^?#]+(?:#.*)?)$/u;

export type GuideLink = { name: string; anchor: string | null };

/** The address of a guide page (and a heading of it) in the app. */
export function guideHref(name: string, anchor: string | null = null): string {
  const query = `?${new URLSearchParams({ guide: name }).toString()}`;
  return anchor === null ? query : `${query}#${anchor}`;
}

/** The page and heading a link written by `guideHref` opens; null for any other link. */
export function guideLinkOf(href: string): GuideLink | null {
  if (!href.startsWith('?')) {
    return null;
  }
  const [query = '', anchor] = href.slice(1).split('#');
  const name = new URLSearchParams(query).get('guide');
  return name === null ? null : { name, anchor: anchor ?? null };
}

/** A guide link (`href`) or image (`src`) rewritten for the app; undefined leaves it as written. */
export function guideUrl(url: string, key: string): string | undefined {
  if (key === 'src') {
    const file = SCREENSHOT.exec(url)?.groups?.file;
    return file === undefined ? undefined : `/api/guide/images/${file}`;
  }
  const page = PAGE_LINK.exec(url)?.groups;
  if (page?.name !== undefined) {
    return guideHref(page.name, page.anchor ?? null);
  }
  const outside = OUTSIDE.exec(url)?.groups?.path;
  return outside === undefined ? undefined : `${REPO_URL}${outside}`;
}
