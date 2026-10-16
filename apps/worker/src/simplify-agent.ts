// The implementer's session asked to rewrite its commits, and the report the step leaves.
import { resolveAgent, type Db } from '@union/core';

import { IMPLEMENT_DENIED } from './implement-loop';
import type { Rebase, SessionTask } from './rebase-agent';
import type { History } from './simplify-git';

const SHORT_SHA = 7;

/** The implementer's denied rules, minus the history rewrites this run is for. */
export const SIMPLIFY_DENIED = IMPLEMENT_DENIED.filter(
  (rule) => rule !== 'Bash(git rebase*)' && rule !== 'Bash(git reset*)',
);

/** A refused commit stops the rewrite; the user decides on it, as for the implementer. */
const HOOK_HINT =
  '\n\nIf a git hook refuses one of the commits, do not bypass it with `--no-verify` and do not change any file to satisfy it: the content was already checked. Stop there and leave every change not committed yet staged (`git add -A`), explain in your report what the hook refused, and end the report with the line `Refused commit: <the commit message you wanted>`. The user then decides whether to commit them without the hooks, as the last commit, or to keep the old history.';

function commitCount(count: number): string {
  return count === 1 ? '1 commit' : `${count} commits`;
}

/** The simplify prompt, with the branch, its fork point and its commits as they are now. */
export function simplifyTask(db: Db, rebase: Rebase, start: History): SessionTask {
  const { base, branch } = rebase;
  const instructions = `${resolveAgent(db, 'simplify').prompt}\n\nYour branch is \`${branch}\`: ${commitCount(start.commits)} since it left \`${base}\` at \`${start.fork}\` (the fork point). Leave that fork point as it is, even if \`origin/${base}\` moved since.${HOOK_HINT}`;
  return { agent: 'simplify', instructions, denied: SIMPLIFY_DENIED };
}

/** What the host checked and pushed, under the agent's own report. */
export function renderSimplifyReport(input: {
  agentReport: string;
  branch: string;
  start: History;
  end: History;
  commits: { before: string; after: string };
}): string {
  const { branch, start, end, commits } = input;
  const result =
    commits.before === commits.after
      ? `**History unchanged:** \`${branch}\` keeps its ${commitCount(start.commits)}; nothing was pushed.`
      : `**Rewrote** \`${branch}\` from ${commitCount(start.commits)} to ${commitCount(end.commits)} (${commits.before.slice(0, SHORT_SHA)} → ${commits.after.slice(0, SHORT_SHA)}), the same content, and force-pushed.`;
  return [input.agentReport.trim(), '---', result].join('\n\n');
}
