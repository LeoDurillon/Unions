// A pull request of the repository: `12`, `#12` or its `/pull/12` URL.
const GITHUB_URL =
  /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/(?<kind>pull|issues)\/(?<number>\d+)(?:[/?#].*)?$/u;
const NUMBER = /^#?(?<number>\d+)$/u;

/**
 * The number in `12`, `#12` or a `https://github.com/<owner>/<repo>/<kind>/12` URL; null when the
 * input is none of these, or the URL points at another repository or is of the other kind.
 */
function parseRef(
  input: string,
  owner: string,
  repo: string,
  kind: 'pull' | 'issues',
): number | null {
  const text = input.trim();
  const url = GITHUB_URL.exec(text)?.groups;
  if (url) {
    const sameRepo =
      url.owner?.toLowerCase() === owner.toLowerCase() &&
      url.repo?.toLowerCase() === repo.toLowerCase();
    return sameRepo && url.kind === kind ? Number(url.number) : null;
  }
  const number = NUMBER.exec(text)?.groups?.number;
  return number && Number(number) > 0 ? Number(number) : null;
}

/** A pull request of the repository: `12`, `#12` or its `/pull/12` URL. */
export function parsePullRequestRef(input: string, owner: string, repo: string): number | null {
  return parseRef(input, owner, repo, 'pull');
}

/** An issue of the repository: `12`, `#12` or its `/issues/12` URL. */
export function parseIssueRef(input: string, owner: string, repo: string): number | null {
  return parseRef(input, owner, repo, 'issues');
}
