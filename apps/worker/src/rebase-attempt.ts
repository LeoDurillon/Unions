// One rebase attempt: git's own rebase first, the implementer's session only when it stops or breaks the checks.

import { remoteOf } from './branch-push';
import { install } from './implement-checks';
import { runRebaseAgent, type Pushed, type Rebase } from './rebase-agent';
import { pushClean, upToDate } from './rebase-clean';
import { fetchIntoContainer } from './rebase-fetch';
import { contains, forkPoint } from './rebase-git';
import {
  checksFailedHint,
  retargetCommand,
  retargetHint,
  stackHint,
  stoppedHint,
  tryHostRebase,
} from './rebase-host';
import { pauseRebase, verifyAndPush } from './rebase-publish';
import type { StepResult } from './scheduler';
import { lowerSlices, syncLowerBranches } from './stack-refs';

/** The base a move leaves, read but not checked like the slices; none when the workspace's copy serves. */
function leftRefs(retarget: Rebase['retarget']): { left?: { name: string; source: string } } {
  if (!retarget || retarget.source === null) {
    return {};
  }
  return { left: { name: retarget.from, source: retarget.source } };
}

/**
 * Fetches the branch (and a stack's lower slices) as GitHub has them; refuses when one has commits
 * the workspace lacks. The lower slices' branches are put where they were last pushed.
 */
async function fetchChecked(
  rebase: Rebase,
): Promise<{ pushed: string; extra: string[] } | { error: string }> {
  const { deps, container, branch, base, context } = rebase;
  const remote = await remoteOf(deps, rebase.project);
  const lower = lowerSlices(deps.db, context.ticket.id);
  const extra = lower.map((slice) => slice.branch);
  const pushed = await fetchIntoContainer(deps.runtime, container, remote, {
    base,
    branch,
    extra,
    ...leftRefs(rebase.retarget),
  });
  for (const name of [branch, ...extra]) {
    if (!(await contains(deps.runtime, container, 'HEAD', `origin/${name}`))) {
      return {
        error: `\`${name}\` on GitHub has commits this ticket's workspace does not: rebasing would drop them.`,
      };
    }
  }
  await syncLowerBranches(deps.runtime, container, lower);
  return { pushed, extra };
}

/**
 * Which commits move (`onto`: only the ones after it), the command that moves them, and what the
 * agent is told about it: a restack's or a change of target's, else a plain rebase.
 */
async function movePlan(
  rebase: Rebase,
  extra: string[],
): Promise<{ onto?: string; hint: string; command?: string }> {
  const { deps, container, base, retarget } = rebase;
  if (!retarget) {
    const onto = rebase.restack?.upstream;
    return { ...(onto === undefined ? {} : { onto }), hint: stackHint(base, extra, onto) };
  }
  const fork = await forkPoint(deps.runtime, container, { ...retarget, before: rebase.before });
  return {
    onto: fork,
    hint: retargetHint(retarget.from, base, fork),
    command: retargetCommand(base, fork),
  };
}

/**
 * Fetch, safety check, then git's own rebase: pushed as it is when clean and checked, else the agent
 * is told why it is needed. An `ok` result was pushed (or had nothing to push); any other was not.
 */
export async function attempt(rebase: Rebase): Promise<StepResult | Pushed> {
  const { deps, container, base, context } = rebase;
  const fetched = await fetchChecked(rebase);
  if ('error' in fetched) {
    return { kind: 'error', error: fetched.error };
  }
  const { pushed, extra } = fetched;
  const updateRefs = extra.length > 0;
  const { hint: stack, command, ...move } = await movePlan(rebase, extra);
  const ownOnly = rebase.retarget !== undefined;
  const host = await tryHostRebase(deps.runtime, container, {
    ...rebase,
    ...move,
    updateRefs,
    ownOnly,
  });
  if (host.kind === 'up_to_date') {
    context.log({ type: 'union_note', text: `already up to date with origin/${base}` });
    return upToDate(rebase);
  }
  const installError = await install(rebase);
  if (installError) {
    return { kind: 'error', error: installError };
  }
  if (host.kind === 'stopped' && rebase.restack?.hostOnly) {
    return { kind: 'error', error: hostOnlyStopped(host.files) };
  }
  if (host.kind === 'stopped') {
    context.log({ type: 'union_note', text: rebaseStoppedNote(host.files) });
    return withAgent(rebase, { lease: pushed, why: stoppedHint(base, host, command) + stack });
  }
  const clean = await pushClean(rebase, pushed);
  if (!('checksFailed' in clean)) {
    context.log({ type: 'union_note', text: 'rebased with no conflict: no agent needed' });
    return clean;
  }
  if (rebase.restack?.hostOnly) {
    return { kind: 'error', error: hostOnlyStopped([]) };
  }
  context.log({ type: 'union_note', text: 'rebased with no conflict, but the checks fail' });
  return withAgent(rebase, {
    lease: pushed,
    why: checksFailedHint(base, clean.checksFailed) + stack,
  });
}

/** A restack started after a merge runs no agent: the user asks for one with Restack. */
function hostOnlyStopped(files: string[]): string {
  const where =
    files.length > 0
      ? `conflicts in ${files.map((file) => `\`${file}\``).join(', ')}`
      : 'failing checks';
  return `Moving the rest of the stack onto the base stopped on ${where}. Nothing was pushed: click Restack in the PR tab to let the implementation agent resolve it.`;
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
