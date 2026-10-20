// The todo the host gives `git rebase -i` to restack a revision: each new commit moved into its slice.

import { describeCommit, fixupTarget, sliceTrailer, type StackCommit } from './stack-trailers';

/** A slice as the restack reads it: its commits, oldest first, and its branch. */
export type RestackSlice = { position: number; branch: string; commits: readonly string[] };

type Entry = { sha: string; fixups: string[] };

export type RestackPlan =
  | {
      ok: true;
      /** The rebase todo, for `GIT_SEQUENCE_EDITOR`. */
      todo: string;
      /** The slices a new commit went into; the ones above them only move. */
      changed: number[];
    }
  | { ok: false; problems: string[] };

function findEntry(slices: Entry[][], sha: string): { entry: Entry; slice: number } | null {
  for (const [at, entries] of slices.entries()) {
    const entry = entries.find((candidate) => candidate.sha === sha);
    if (entry) {
      return { entry, slice: at + 1 };
    }
  }
  return null;
}

const FIXUP_PROBLEMS = {
  unknown: 'is not a commit of the stack',
  ambiguous: 'matches several commits: give more of the sha',
  not_sha: 'is not a sha: name the commit by its sha',
} as const;

/** Where one added commit goes: folded into its target, or picked at the end of its slice. */
function place(slices: Entry[][], commit: StackCommit, changed: Set<number>): string | null {
  const known = slices.flat();
  const fixup = fixupTarget(commit, known);
  if (fixup?.kind === 'target') {
    const found = findEntry(slices, fixup.sha);
    if (found) {
      found.entry.fixups.push(commit.sha);
      changed.add(found.slice);
    }
    return null;
  }
  if (fixup) {
    return `${describeCommit(commit)}: \`${fixup.named}\` ${FIXUP_PROBLEMS[fixup.kind]}.`;
  }
  const slice = sliceTrailer(commit);
  const entries = slice === null ? undefined : slices[slice - 1];
  if (slice === null || entries === undefined) {
    return `${describeCommit(commit)} names no slice of the stack: add a \`Slice:\` trailer.`;
  }
  entries.push({ sha: commit.sha, fixups: [] });
  changed.add(slice);
  return null;
}

/** The todo lines of every slice; the lower slices' branches follow their last commit. */
function todoLines(slices: Entry[][], stack: readonly RestackSlice[]): string[] {
  const top = stack.length;
  return slices.flatMap((entries, at) => {
    const picks = entries.flatMap((entry) => [
      `pick ${entry.sha}`,
      ...entry.fixups.map((sha) => `fixup ${sha}`),
    ]);
    const branch = stack[at]?.branch;
    return at + 1 < top && branch !== undefined
      ? [...picks, `update-ref refs/heads/${branch}`]
      : picks;
  });
}

/**
 * Restacks the commits a revision added on top of the stack (oldest first): a `fixup! <sha>`
 * folds into that commit, a `Slice: <n>` commit goes at the end of slice n. The code at the end is
 * the same; the host checks the tree after.
 */
export function restackPlan(
  stack: readonly RestackSlice[],
  added: readonly StackCommit[],
): RestackPlan {
  const slices: Entry[][] = stack.map((slice) => slice.commits.map((sha) => ({ sha, fixups: [] })));
  const changed = new Set<number>();
  const problems = added.flatMap((commit) => place(slices, commit, changed) ?? []);
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  const todo = `${todoLines(slices, stack).join('\n')}\n`;
  return { ok: true, todo, changed: [...changed].toSorted((a, b) => a - b) };
}
