// A conflict while moving a revision's commits into their slices, handed to the implementer's session to resolve.
import { shortSha, type RestackSlice } from '@union/core';

import type { Ask } from './leftovers';
import type { Resolve, Stop } from './stack-revise-git';

/** What was being applied: a slice's own commit, replayed over a fix below it, or a new commit. */
function applying(stack: readonly RestackSlice[], stop: Stop): string {
  const commit = `\`${shortSha(stop.sha)} ${stop.subject}\``;
  const slice = stack.find((entry) => entry.commits.includes(stop.sha));
  return slice === undefined
    ? `your commit ${commit}, moved into its slice`
    : `slice ${slice.position}'s commit ${commit}, replayed over your fix below it`;
}

/** The turn asking the implementer to resolve one stop of the replay. */
export function conflictPrompt(
  stack: readonly RestackSlice[],
  input: { stop: Stop; head: string },
): string {
  const { stop } = input;
  const files = stop.files.map((file) => `\`${file}\``).join(', ');
  const head = shortSha(input.head);
  return `Moving your new commits into their slices stopped on a conflict while applying ${applying(stack, stop)}, in ${files}.

Resolve each file as it should read after this commit, at this point of the stack: this slice's own change, with your fixes in the slices below, and nothing of the slices above. Then stage it with \`git add\`. Do not commit, do not run \`git rebase\` and do not check out another branch: the host continues the replay and asks you again at the next conflict.

When the replay ends, the stack's top must be exactly your branch as you left it (\`${head}\`): \`git diff ${head} -- <file>\` shows what the commits still to replay will change. Answer with one line saying what you resolved.`;
}

/** Each conflict of the replay asked about in the implementer's session; a failed turn gives up. */
export function conflictResolver(
  ask: Ask,
  input: { stack: readonly RestackSlice[]; head: string },
): Resolve {
  return async function resolve(stop: Stop): Promise<boolean> {
    const answer = await ask(conflictPrompt(input.stack, { stop, head: input.head }));
    return answer !== null;
  };
}
