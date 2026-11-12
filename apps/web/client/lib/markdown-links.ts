// Where a repository Markdown file's links and images go. A file of the repository opens in the
// Repository tab, an image of it loads from the repository, the rest is left as written.
import { repositoryImageType } from '@union/core/repository-blob';

import type { RepositoryEntry } from '../../src/repository-api-types';
import { githubUrl, type GitHubPlace } from './repo-links';
import { resolveRepoPath } from './repo-paths';

/** What a Markdown file's links are read against: the repository at the commit shown. */
export type MarkdownBase = {
  projectId: number;
  place: GitHubPlace;
  /** The branch in the URL, kept on the links (null: the base branch). */
  ref: string | null;
  byPath: Map<string, RepositoryEntry>;
};

/** The tab's own address for a path, so a click can open it without leaving the page. */
export function tabHref(ref: string | null, path: string): string {
  const params = new URLSearchParams({ view: 'repository' });
  if (ref !== null) {
    params.set('repo-ref', ref);
  }
  if (path !== '') {
    params.set('repo-path', path);
  }
  return `?${params.toString()}`;
}

/** The path a link written by `tabHref` opens; null for any other link. */
export function tabPathOf(href: string): string | null {
  if (!href.startsWith('?')) {
    return null;
  }
  const params = new URLSearchParams(href);
  return params.get('view') === 'repository' ? (params.get('repo-path') ?? '') : null;
}

function imageSrc(base: MarkdownBase, path: string): string {
  const entry = base.byPath.get(path);
  if (!entry || repositoryImageType(path) === null) {
    // Shown as "Image not available" rather than a request bound to fail.
    return '';
  }
  const query = new URLSearchParams({ sha: entry.sha, path, size: String(entry.size ?? '') });
  return `/api/projects/${base.projectId}/repository/raw?${query.toString()}`;
}

/**
 * A link (`href`) or image (`src`) of the Markdown file `from`, rewritten; undefined leaves a URL or an anchor
 * to the default. A link to a path the commit does not hold goes to GitHub.
 */
export function markdownUrl(
  base: MarkdownBase,
  from: string,
  url: string,
  key: string,
): string | undefined {
  const path = resolveRepoPath(from, url);
  if (path === null) {
    return undefined;
  }
  if (key === 'src') {
    return imageSrc(base, path);
  }
  const entry = base.byPath.get(path);
  return path === '' || entry ? tabHref(base.ref, path) : githubUrl(base.place, path, entry);
}
