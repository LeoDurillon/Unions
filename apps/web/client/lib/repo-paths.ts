// Where a relative link in a repository file points: `../docs/a.md` from `src/README.md` is `docs/a.md`.
import { parentOf } from './repo-tree';

const SCHEME = /^[a-z][a-z\d+.-]*:/iu;

function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** The link without its query and anchor; null when it leaves the repository (a URL, an anchor alone). */
function bareLink(url: string): string | null {
  if (url.startsWith('#') || url.startsWith('//') || SCHEME.test(url)) {
    return null;
  }
  const bare = url.split(/[?#]/u)[0] ?? '';
  return bare === '' ? null : bare;
}

/**
 * The repository path a link in the file `from` points to (`''` for the root); null for a URL, an anchor, or a
 * link that climbs above the root. A leading `/` starts from the root, as on GitHub.
 */
export function resolveRepoPath(from: string, url: string): string | null {
  const bare = bareLink(url);
  if (bare === null) {
    return null;
  }
  const parts = bare.startsWith('/') ? [] : parentOf(from).split('/').filter(Boolean);
  for (const part of bare.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) {
        return null;
      }
    } else if (part !== '' && part !== '.') {
      parts.push(decoded(part));
    }
  }
  return parts.join('/');
}
