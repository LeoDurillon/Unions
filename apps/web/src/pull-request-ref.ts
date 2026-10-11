const PR_URL =
  /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/pull\/(?<number>\d+)(?:[/?#].*)?$/u;
const PR_NUMBER = /^#?(?<number>\d+)$/u;

/**
 * The pull request number in `12`, `#12` or `https://github.com/<owner>/<repo>/pull/12`; null when
 * the input is none of these or the URL points at another repository.
 */
export function parsePullRequestRef(input: string, owner: string, repo: string): number | null {
  const text = input.trim();
  const url = PR_URL.exec(text)?.groups;
  if (url) {
    const sameRepo =
      url.owner?.toLowerCase() === owner.toLowerCase() &&
      url.repo?.toLowerCase() === repo.toLowerCase();
    return sameRepo ? Number(url.number) : null;
  }
  const number = PR_NUMBER.exec(text)?.groups?.number;
  return number && Number(number) > 0 ? Number(number) : null;
}
