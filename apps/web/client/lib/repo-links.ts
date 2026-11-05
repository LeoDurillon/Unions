// Where a file or folder of the repository is on GitHub, and a file's size in words.
import type { RepositoryEntry } from '../../src/repository-api-types';

/** The repository and the commit the Repository tab shows. */
export type GitHubPlace = { owner: string; repo: string; sha: string };

/** The file or folder on GitHub at the commit shown; the root when `path` is empty. */
export function githubUrl(
  place: GitHubPlace,
  path: string,
  entry: RepositoryEntry | undefined,
): string {
  const kind = path === '' || entry?.type === 'dir' ? 'tree' : 'blob';
  const tail =
    path === ''
      ? ''
      : `/${path
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/')}`;
  return `https://github.com/${place.owner}/${place.repo}/${kind}/${place.sha}${tail}`;
}

/** A sha as GitHub shortens it. */
export const SHORT_SHA = 7;

const KB = 1024;

/** A size in bytes, KB or MB. */
export function sizeText(bytes: number): string {
  if (bytes < KB) {
    return `${bytes} B`;
  }
  if (bytes < KB * KB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  }
  return `${(bytes / KB / KB).toFixed(1)} MB`;
}
