// The implementer's session asked to rewrite its commits into the approved slices, and the split's report.
import { resolveAgent, shortSha, type Db, type PlannedSlice } from '@union/core';

import type { Rebase, SessionTask } from './rebase-agent';
import { SIMPLIFY_DENIED } from './simplify-agent';
import type { History } from './simplify-git';

const HOOK_HINT =
  '\n\nIf a git hook refuses one of the commits, do not bypass it with `--no-verify` and do not change any file to satisfy it: stop and explain in your report what it refused. The split then fails and the branch is put back as it was.';

function sliceList(slices: readonly PlannedSlice[]): string {
  return slices.map((slice) => `${slice.position}. ${slice.title}`).join('\n');
}

/** The split prompt: the branch, its fork point, the slices and the approved plan in full. */
export function splitTask(
  db: Db,
  rebase: Rebase,
  input: { start: History; slices: readonly PlannedSlice[]; plan: string },
): SessionTask {
  const { base, branch } = rebase;
  const { start, slices, plan } = input;
  const instructions = `${resolveAgent(db, 'split').prompt}\n\nYour branch is \`${branch}\`: ${start.commits} commit(s) since it left \`${base}\` at \`${start.fork}\` (the fork point). Leave that fork point as it is, even if \`origin/${base}\` moved since.\n\nThe slices, bottom first:\n\n${sliceList(slices)}\n\n# Approved split plan\n\n${plan.trim()}${HOOK_HINT}`;
  return { agent: 'split', instructions, denied: SIMPLIFY_DENIED };
}

/** Another turn when the host refused the result: what to fix. */
export function fixTask(task: SessionTask, problems: readonly string[]): SessionTask {
  const list = problems.map((problem) => `- ${problem}`).join('\n');
  return {
    ...task,
    instructions: `The host cannot publish your split:\n\n${list}\n\nFix the history (the same content at the end, each commit with its \`Slice:\` trailer), then report again.`,
  };
}

/** A slice as published: its branch and tip, and its pull request if it has one. */
export type PublishedSlice = PlannedSlice & {
  branch: string;
  tipSha: string;
  prNumber: number | null;
};

function sliceLine(slice: PublishedSlice): string {
  const pr = slice.prNumber === null ? 'no pull request' : `#${slice.prNumber}`;
  return `${slice.position}. **${slice.title}**: \`${slice.branch}\` at ${shortSha(slice.tipSha)}, ${pr}`;
}

/** What the host checked and published, under the agent's own report. */
export function renderSplitReport(input: {
  agentReport: string;
  slices: readonly PublishedSlice[];
  checks: string;
  warnings: readonly string[];
}): string {
  const { slices, warnings } = input;
  const warned =
    warnings.length === 0
      ? []
      : [`**Not done on GitHub:**\n\n${warnings.map((w) => `- ${w}`).join('\n')}`];
  return [
    input.agentReport.trim(),
    '---',
    `**Split** into ${slices.length} slices, the same content, and force-pushed:\n\n${slices.map((slice) => sliceLine(slice)).join('\n')}`,
    input.checks,
    ...warned,
  ].join('\n\n');
}
