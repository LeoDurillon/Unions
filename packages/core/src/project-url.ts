export type ProjectLocator = { kind: 'orgs' | 'users'; login: string; number: number };

const PROJECT_URL =
  /^https:\/\/github\.com\/(?<kind>orgs|users)\/(?<login>[\w.-]+)\/projects\/(?<number>\d+)(?:[/?#].*)?$/u;

/** Parses `https://github.com/orgs/<login>/projects/<n>` (or `users/`). */
export function parseProjectUrl(url: string): ProjectLocator | null {
  const { kind, login, number } = PROJECT_URL.exec(url.trim())?.groups ?? {};
  if ((kind !== 'orgs' && kind !== 'users') || !login || !number) {
    return null;
  }
  return { kind, login, number: Number(number) };
}
