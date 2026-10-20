// Reading a stack's commits: the `Slice: <n>` trailer, `fixup! <sha>` targets, and the slices' tips.

/** A commit of the ticket's branch as the host reads it, oldest first. */
export type StackCommit = { sha: string; subject: string; body: string };

const SLICE_TRAILER = /^Slice:[ \t]*(?<slice>[1-9]\d*)[ \t]*$/gmu;
const FIXUP = /^fixup! (?<named>.+?)\s*$/u;
const SHA = /^[0-9a-f]{7,40}$/u;
const SHORT_SHA = 8;

/** The slice a commit names in its last `Slice:` trailer; null without one. */
export function sliceTrailer(commit: StackCommit): number | null {
  const slice = [...commit.body.matchAll(SLICE_TRAILER)].at(-1)?.groups?.slice;
  return slice === undefined ? null : Number(slice);
}

export type FixupTarget =
  | { kind: 'target'; sha: string }
  | { kind: 'unknown' | 'ambiguous' | 'not_sha'; named: string };

/**
 * The commit a `fixup! <sha>` folds into, among `commits`; null for a commit that is not a fixup.
 * A subject is refused (`not_sha`): subjects repeat ("Add tests"), a sha does not.
 */
export function fixupTarget(
  commit: StackCommit,
  commits: readonly { sha: string }[],
): FixupTarget | null {
  const named = FIXUP.exec(commit.subject)?.groups?.named;
  if (named === undefined) {
    return null;
  }
  if (!SHA.test(named)) {
    return { kind: 'not_sha', named };
  }
  const matches = commits.filter((candidate) => candidate.sha.startsWith(named));
  const [only] = matches;
  if (only === undefined) {
    return { kind: 'unknown', named };
  }
  return matches.length === 1 ? { kind: 'target', sha: only.sha } : { kind: 'ambiguous', named };
}

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA);
}

export function describeCommit(commit: StackCommit): string {
  return `${shortSha(commit.sha)} "${commit.subject}"`;
}

export type SliceTips = { ok: true; tips: string[] } | { ok: false; problems: string[] };

function trailerProblems(commits: readonly StackCommit[], count: number): string[] {
  const problems: string[] = [];
  let last = 1;
  for (const commit of commits) {
    const slice = sliceTrailer(commit);
    if (slice === null) {
      problems.push(`${describeCommit(commit)} has no \`Slice:\` trailer.`);
    } else if (slice > count) {
      problems.push(`${describeCommit(commit)} names slice ${slice}; there are ${count}.`);
    } else if (slice < last) {
      problems.push(`${describeCommit(commit)} names slice ${slice} after slice ${last}.`);
    } else {
      last = slice;
    }
  }
  return problems;
}

/**
 * The tip of each slice (index 0 is slice 1) from the commits a split wrote, oldest first: each
 * commit names its slice, slices never go back, and every slice has a commit.
 */
export function sliceTips(commits: readonly StackCommit[], count: number): SliceTips {
  const problems = trailerProblems(commits, count);
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  const tips: string[] = [];
  for (const commit of commits) {
    tips[(sliceTrailer(commit) ?? 1) - 1] = commit.sha;
  }
  const empty = Array.from({ length: count }, (_, at) => at + 1).filter(
    (slice) => tips[slice - 1] === undefined,
  );
  if (empty.length > 0) {
    return { ok: false, problems: empty.map((slice) => `Slice ${slice} has no commit.`) };
  }
  return { ok: true, tips };
}
