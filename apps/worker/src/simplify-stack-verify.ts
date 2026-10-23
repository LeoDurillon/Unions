// Checks a stack's simplified history before it is pushed: every commit in its slice, every slice's tip with the same content.
import { shortSha, sliceTrailer, sliceTips, type StackCommit, type TicketSlice } from '@union/core';

import type { Rebase } from './rebase-agent';
import { contains, headCommit } from './rebase-git';
import { simplifyProblem, type History } from './simplify-git';
import { stackCommits } from './stack-git';
import { treeOf } from './stack-revise-git';

export type StackVerified =
  | { ok: true; tips: string[]; commits: number[] }
  | { ok: false; problems: string[] };

/** Why the workspace is not the stack as last pushed, or null: the slices' tips in order, up to HEAD. */
export async function stackProblem(
  rebase: Rebase,
  slices: readonly TicketSlice[],
): Promise<string | null> {
  const { runtime } = rebase.deps;
  const head = await headCommit(runtime, rebase.container);
  if (head !== slices.at(-1)?.tipSha) {
    return `\`${rebase.branch}\` in the workspace is not where the stack was last pushed: push or restack it first.`;
  }
  for (const [at, slice] of slices.slice(1).entries()) {
    const below = slices[at];
    if (below && !(await contains(runtime, rebase.container, slice.tipSha, below.tipSha))) {
      return `Slice ${at + 2} (${slice.title}) is not on the slice below it: restack first.`;
    }
  }
  return null;
}

function countsPerSlice(commits: readonly StackCommit[], count: number): number[] {
  const counts = Array.from({ length: count }, () => 0);
  for (const commit of commits) {
    const at = (sliceTrailer(commit) ?? 1) - 1;
    counts[at] = (counts[at] ?? 0) + 1;
  }
  return counts;
}

/** The slices whose new tip does not hold what their recorded tip did. */
async function changedSlices(
  rebase: Rebase,
  slices: readonly TicketSlice[],
  tips: readonly string[],
): Promise<string[]> {
  const { runtime } = rebase.deps;
  const problems: string[] = [];
  for (const [at, slice] of slices.entries()) {
    const tip = tips[at] ?? '';
    const [before, after] = await Promise.all([
      treeOf(runtime, rebase.container, slice.tipSha),
      treeOf(runtime, rebase.container, tip),
    ]);
    if (before !== after) {
      problems.push(
        `Slice ${at + 1} (${slice.title}) ends at ${shortSha(tip)} with other content than its tip ${shortSha(slice.tipSha)}: \`git diff ${shortSha(slice.tipSha)} ${shortSha(tip)}\` must be empty.`,
      );
    }
  }
  return problems;
}

/**
 * Why the simplified stack cannot be pushed, or each slice's new tip (bottom first) and how many
 * commits it now has: the checks of a simplified branch, every commit's trailer in order, and the
 * same content at each slice's tip.
 */
export async function verifyStackSimplify(
  rebase: Rebase,
  input: { start: History; slices: readonly TicketSlice[] },
): Promise<StackVerified> {
  const { deps, container, branch, base } = rebase;
  const { start, slices } = input;
  const problem = await simplifyProblem(deps.runtime, container, { branch, base, start });
  if (problem) {
    return { ok: false, problems: [problem] };
  }
  const commits = await stackCommits(deps.runtime, container, start.fork);
  const tips = sliceTips(commits, slices.length);
  if (!tips.ok) {
    return tips;
  }
  const problems = await changedSlices(rebase, slices, tips.tips);
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, tips: tips.tips, commits: countsPerSlice(commits, slices.length) };
}
