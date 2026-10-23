// The implementer's session asked to simplify a split ticket's commits slice by slice, and the step's report.
import { resolveAgent, shortSha, type Db, type TicketSlice } from '@union/core';

import type { Rebase, SessionTask } from './rebase-agent';
import { SIMPLIFY_DENIED } from './simplify-agent';
import type { History } from './simplify-git';

const HOOK_HINT =
  '\n\nIf a git hook refuses one of the commits, do not bypass it with `--no-verify` and do not change any file to satisfy it: stop and explain in your report what it refused. The simplification then fails and the stack is put back as it was.';

/** A slice as the agent rewrites it: its recorded tip and its commits there (`<sha> <subject>`). */
export type SliceHistory = { slice: TicketSlice; log: readonly string[] };

function sliceLine({ slice, log }: SliceHistory, number: number): string {
  const commits = log.map((line) => `   - ${line}`).join('\n');
  return `${number}. **${slice.title}** (\`${slice.branch}\`, tip \`${slice.tipSha}\`):\n${commits}`;
}

/** The simplify prompt, with the stack's slices, their tips and their commits as they are now. */
export function stackSimplifyTask(
  db: Db,
  rebase: Rebase,
  input: { start: History; slices: readonly SliceHistory[] },
): SessionTask {
  const { base, branch } = rebase;
  const { start, slices } = input;
  const list = slices.map((slice, at) => sliceLine(slice, at + 1)).join('\n');
  const instructions = `${resolveAgent(db, 'simplify').prompt}

Your branch is \`${branch}\`: it left \`${base}\` at \`${start.fork}\` (the fork point). Leave that fork point as it is, even if \`origin/${base}\` moved since.

# Stack

This ticket's pull request is split into a stack, bottom first; each slice is a pull request on the one below, and is reviewed on its own:

${list}

Simplify each slice's commits on their own: never move a change from one slice to another. Each slice must end with exactly the same content as its tip above: the host compares every slice's new tip with it, and moves each lower slice's branch to its new tip itself. Every commit message ends with a trailer naming its slice, on its own line after a blank line: \`Slice: <n>\` (numbered as above). The trailers never go back (1, 1, 2, 3).
For example: \`git reset --soft <fork point>\` and \`git reset\`, then for each slice in turn, \`git diff --binary HEAD <its tip> -- <paths> | git apply --cached\` stages what it changes in those paths; commit, and check \`git diff --quiet HEAD <its tip>\` before the next slice. Do not create or move branches.${HOOK_HINT}`;
  return { agent: 'simplify', instructions, denied: SIMPLIFY_DENIED };
}

/** Another turn when the host refused the result: what to fix. */
export function stackFixTask(task: SessionTask, problems: readonly string[]): SessionTask {
  const list = problems.map((problem) => `- ${problem}`).join('\n');
  return {
    ...task,
    instructions: `The host cannot push your simplified stack:\n\n${list}\n\nFix the history (each slice ending with exactly the same content as its tip, each commit with its \`Slice:\` trailer), then report again.`,
  };
}

function commitCount(count: number): string {
  return count === 1 ? '1 commit' : `${count} commits`;
}

/** A slice before and after: its commits and tips. */
export type SliceChange = SliceHistory & { tip: string; commits: number };

function changeLine({ slice, log, tip, commits }: SliceChange, number: number): string {
  const moved = tip === slice.tipSha ? 'unchanged' : `${shortSha(slice.tipSha)} → ${shortSha(tip)}`;
  return `${number}. **${slice.title}** (\`${slice.branch}\`): ${commitCount(log.length)} → ${commitCount(commits)}, ${moved}`;
}

/** What the host checked and pushed, under the agent's own report. */
export function renderStackSimplifyReport(input: {
  agentReport: string;
  slices: readonly SliceChange[];
  pushed: boolean;
}): string {
  const result = input.pushed
    ? '**Rewrote** each slice, the same content at every tip, and force-pushed the stack:'
    : '**History unchanged:** nothing was pushed.';
  const lines = input.slices.map((slice, at) => changeLine(slice, at + 1)).join('\n');
  return [input.agentReport.trim(), '---', `${result}\n\n${lines}`].join('\n\n');
}
