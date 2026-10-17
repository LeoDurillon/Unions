// One rebase attempt: git's own rebase first, the implementer's session only when it stops or breaks the checks.
import { install } from './implement-checks';
import { runRebaseAgent, type Pushed, type Rebase } from './rebase-agent';
import { pushClean, upToDate } from './rebase-clean';
import { fetchIntoContainer } from './rebase-fetch';
import { contains } from './rebase-git';
import { checksFailedHint, stoppedHint, tryHostRebase } from './rebase-host';
import { pauseRebase, remoteOf, verifyAndPush } from './rebase-publish';
import type { StepResult } from './scheduler';

/**
 * Fetch, safety check, then git's own rebase: pushed as it is when clean and checked, else the agent
 * is told why it is needed. An `ok` result was pushed (or had nothing to push); any other was not.
 */
export async function attempt(rebase: Rebase): Promise<StepResult | Pushed> {
  const { deps, container, branch, base, context } = rebase;
  const remote = await remoteOf(deps, rebase.project);
  const pushed = await fetchIntoContainer(deps.runtime, container, remote, { base, branch });
  if (!(await contains(deps.runtime, container, 'HEAD', `origin/${branch}`))) {
    return {
      kind: 'error',
      error: `\`${branch}\` on GitHub has commits this ticket's workspace does not: rebasing would drop them.`,
    };
  }
  const host = await tryHostRebase(deps.runtime, container, rebase);
  if (host.kind === 'up_to_date') {
    context.log({ type: 'union_note', text: `already up to date with origin/${base}` });
    return upToDate(rebase);
  }
  const installError = await install(rebase);
  if (installError) {
    return { kind: 'error', error: installError };
  }
  if (host.kind === 'stopped') {
    context.log({ type: 'union_note', text: rebaseStoppedNote(host.files) });
    return withAgent(rebase, { lease: pushed, why: stoppedHint(base, host) });
  }
  const clean = await pushClean(rebase, pushed);
  if (!('checksFailed' in clean)) {
    context.log({ type: 'union_note', text: 'rebased with no conflict: no agent needed' });
    return clean;
  }
  context.log({ type: 'union_note', text: 'rebased with no conflict, but the checks fail' });
  return withAgent(rebase, { lease: pushed, why: checksFailedHint(base, clean.checksFailed) });
}

function rebaseStoppedNote(files: string[]): string {
  return files.length > 0
    ? `git rebase stopped on conflicts in ${files.join(', ')}: the agent resolves them`
    : 'git rebase stopped: the agent takes over';
}

/** The agent's turn, then the host's checks and the push. A result here means it was not pushed. */
async function withAgent(
  rebase: Rebase,
  { lease: pushed, why }: { lease: string; why: string },
): Promise<StepResult | Pushed> {
  const outcome = await runRebaseAgent(rebase, why);
  if (outcome.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAt: null };
  }
  if (outcome.kind === 'error') {
    return { kind: 'error', error: outcome.message };
  }
  const checked = await verifyAndPush(rebase, { pushed, outcome });
  if ('refused' in checked) {
    return pauseRebase(rebase, { refused: checked.refused, outcome, lease: pushed });
  }
  if ('error' in checked) {
    return { kind: 'error', error: `${checked.error}\n\nThe agent's report:\n\n${outcome.text}` };
  }
  return { pushed: true, outcome, gate: checked.gate };
}
