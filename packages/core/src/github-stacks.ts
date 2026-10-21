// GitHub's stacks of pull requests as the REST API answers them, read into one shape for the worker and the web. Browser-safe.

/** The REST version the stacks endpoints belong to. */
export const STACKS_API_HEADERS = { 'X-GitHub-Api-Version': '2026-03-10' };

/** GitHub's own stack over pull requests (stacked pull requests), bottom first. */
export type GitHubStack = {
  number: number;
  open: boolean;
  /** The branch the whole stack merges into. */
  base: string;
  pullRequests: {
    number: number;
    state: 'open' | 'closed';
    mergedAt: number | null;
    headRef: string;
    headSha: string;
  }[];
};

type RawStack = {
  number: number;
  open: boolean;
  base: { ref: string };
  pull_requests: {
    number: number;
    state: string;
    merged_at: string | null;
    head: { ref: string; sha: string };
  }[];
};

function isRawStack(value: unknown): value is RawStack {
  return (
    typeof value === 'object' &&
    value !== null &&
    'number' in value &&
    'pull_requests' in value &&
    Array.isArray(value.pull_requests)
  );
}

function stackOf(raw: RawStack): GitHubStack {
  return {
    number: raw.number,
    open: raw.open,
    base: raw.base.ref,
    pullRequests: raw.pull_requests.map((pull) => ({
      number: pull.number,
      state: pull.state === 'open' ? 'open' : 'closed',
      mergedAt: pull.merged_at === null ? null : Date.parse(pull.merged_at),
      headRef: pull.head.ref,
      headSha: pull.head.sha,
    })),
  };
}

/** The stack of a create, get or add answer; null when it is not one. */
export function parseStack(data: unknown): GitHubStack | null {
  return isRawStack(data) ? stackOf(data) : null;
}

/** The stacks of a list answer; anything else in it is skipped. */
export function parseStacks(data: unknown): GitHubStack[] {
  return Array.isArray(data)
    ? data.filter((item) => isRawStack(item)).map((raw) => stackOf(raw))
    : [];
}
