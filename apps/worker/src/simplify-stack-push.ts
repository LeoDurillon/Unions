// Pushes a stack's simplified history: the lower slices' branches set at their new tips, every branch pushed together.
import type { AgentOutcome } from './agent';
import type { Rebase } from './rebase-agent';
import type { StepResult } from './scheduler';
import { pushIfRewritten } from './simplify-push';
import { renderStackSimplifyReport, type SliceHistory } from './simplify-stack-agent';
import type { StackVerified } from './simplify-stack-verify';
import { setBranches } from './stack-git';

type Ok = Extract<AgentOutcome, { kind: 'ok' }>;

/**
 * Moves each lower slice's branch to its new tip and pushes the stack, leased on what was last
 * pushed (nothing when the agent left the history as it was); the step's result.
 */
export async function pushSimplifiedStack(
  rebase: Rebase,
  input: {
    lease: string;
    before: readonly SliceHistory[];
    verified: Extract<StackVerified, { ok: true }>;
    outcome: Ok;
  },
): Promise<StepResult> {
  const { lease, before, verified, outcome } = input;
  const lower = before.slice(0, -1).map(({ slice }, at) => ({
    branch: slice.branch,
    sha: verified.tips[at] ?? slice.tipSha,
  }));
  await setBranches(rebase.deps.runtime, rebase.container, lower);
  const refused = await pushIfRewritten(rebase, lease);
  if (refused) {
    return { kind: 'error', error: `${refused}\n\nThe agent's report:\n\n${outcome.text}` };
  }
  const slices = before.map(({ slice, log }, at) => ({
    slice,
    log,
    tip: verified.tips[at] ?? slice.tipSha,
    commits: verified.commits[at] ?? 0,
  }));
  const pushed = slices.some((slice) => slice.tip !== slice.slice.tipSha);
  const output = renderStackSimplifyReport({ agentReport: outcome.text, slices, pushed });
  return { kind: 'ok', output, sessionId: outcome.sessionId };
}
