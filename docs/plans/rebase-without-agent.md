# Plan: rebase without an agent when there is no conflict

Status: built (2026-10-17, not committed yet). Decisions taken (2026-10-17): the host tries the rebase first,
and the agent runs only on a conflict or when the checks fail after a clean rebase. The final review runs again
only when an agent wrote code. Built as planned, except: the host attempt is in `rebase-host.ts` and the attempt's
paths in `rebase-attempt.ts` (`rebase.ts` was at the import limit); the Log lines are one `union_note` event type
with a text (shown by the Log), not four event types; the up-to-date check runs before the install.

## Problem

Today every **Rebase** click resumes the implementer's session (`runRebaseAgent` in `apps/worker/src/rebase.ts`),
then always chains into a new `final_review` (`running('rebase')` sets `thenRun: 'final_review'` in
`packages/core/src/states.ts`). That makes two agent runs even when `git rebase` alone would have worked, which is
the usual case. Most of the tokens go on rebases that need no judgment at all.

## Outcomes

| Rebase outcome     | Agent | Final review                          | Pushed |
| ------------------ | ----- | ------------------------------------- | ------ |
| Already up to date | no    | no, back to where it was              | no     |
| Clean, checks pass | no    | no, back to where it was, review kept | yes    |
| Clean, checks fail | yes   | yes                                   | yes    |
| Conflict           | yes   | yes                                   | yes    |

The rule: the final review runs again only when an agent changed code. "Back to where it was" means
`awaiting_approval` on `final_review`, or `done` for a ticket that was Done, the way a simplified history returns
(`afterSimplify`).

## Flow

`attempt()` in `rebase.ts` keeps its start: fetch the bundle, refuse when `origin/<branch>` has commits the
workspace lacks, install. Then:

1. **Up to date:** `origin/<base>` is already in `HEAD` (`contains`). Nothing to push. The output says "Already up
   to date with `origin/<base>`".
2. **Host rebase:** `git -c core.editor=true rebase origin/<base>` in the container (the commit identity is set by
   `workspace-git.ts`). A rebase runs no `pre-commit` or `commit-msg` hook on picked commits, so the hook cannot
   refuse anything here.
3. **Conflict** (non-zero exit): `restoreBranch` to `before` (aborts the rebase, resets, cleans), then the agent
   path as today: `runRebaseAgent` → `verifyAndPush` → push. The prompt gets a line saying the host's
   `git rebase origin/<base>` stopped on conflicts, with the files that conflicted (`git diff --name-only
   --diff-filter=U`, read before the abort).
4. **Clean:** run the project's checks (`deps.services?.ensure()`, then `runGate`).
   - **Green:** `forcePush` with the lease, then `published` with a report written by the host: "Rebased `<branch>`
     cleanly onto `origin/<base>` (abc1234 → def5678), no conflicts. Checks (`<gate>`): passing. The final review
     from before still applies." The step result says the run was clean (below).
   - **Red:** keep the rebased branch and run the agent in the implementer's session with the rebase prompt plus
     a hint: the rebase is already done and clean, the checks fail, here is the tail of their output; fix what the
     base's changes broke, commit, never push. Then `verifyAndPush` as for a conflict (it re-checks the branch state,
     commits leftovers, runs the checks again, pushes). `before` stays the commit from before the host rebase, so a
     failure still puts the branch back exactly as it was. The final review runs again.
5. Any error on the host path (not a conflict: a git failure, a refused push) fails the step as today, with the
   branch restored.

## State machine (`states.ts`, pure, with tests)

- New action `rebased_clean`, accepted only from `running` on `rebase`. It returns like `afterSimplify`:
  `done` when `thenDone`, else `awaiting_approval` on `final_review`.
- `fromDone` starts a rebase with `thenDone: true` (as simplify does), alongside `thenRun: 'final_review'`. For a
  Done ticket, `run_finished` (agent path) still leads to `final_review` and then In review, as today. Only a
  `rebased_clean` uses `thenDone`.
- `fromStalled` (retry) and `commit_refused` keep both flags. Check that `thenRunOf` / `thenDoneOf` carry them
  through every phase the rebase can pass through.
- `states.test.ts`: `rebased_clean` from review returns to review, from Done returns to Done, from any other step
  is refused, and a retried rebase keeps `thenDone`.
- Declare the new action's event in `event-payloads.ts` if the scheduler emits one for it.

## Worker

- `StepResult`'s `ok` gets an optional `clean: true`. The scheduler (`scheduler.ts`, where it maps `ok` to
  `run_finished`) dispatches `rebased_clean` instead when it is set. The run is still `succeeded`.
- **Implementer session:** a clean rebase saves no session id. `implementerSession()` in `rebase-agent.ts` takes
  the latest succeeded `implement`/`rebase`/`simplify` run, so it must filter on `isNotNull(schema.runs.sessionId)`.
  Otherwise the next rebase or simplify would lose the session and start a fresh one with the whole task, which
  costs more tokens, not fewer. `scheduler.ts`'s `lastSessionId` has the same pattern; check what reads it for
  `rebase`.
- `published` still refreshes the review diff (`captureDiff`) and sets `behind_by` to 0. The kept final review now
  sits next to a diff on the new base; its text still applies, but line anchors in its comments may be off by the
  base's changes. Acceptable for v1.
- Log events: `union_rebase_up_to_date`, `union_rebase_clean`, `union_rebase_conflict` (with the files),
  `union_rebase_checks_failed`, so the Log shows which path ran and why the agent was called.
- Files: put the host attempt in a new `rebase-host.ts` (`tryHostRebase`: up to date / clean / conflict with
  files) to keep `rebase.ts` and `rebase-git.ts` under the size and import limits.

## Prompt and docs

- Default `rebase` prompt (`packages/core/src/agents.ts`): the agent is called because the host's rebase stopped
  on conflicts, or because it was clean but the checks fail. Keep "abort if unsafe" and "never push".
- `SPEC.md` § Rebase: step 3 (host first, agent only on conflict or red checks), step 5 ("final_review always runs
  again" becomes "only when the agent ran"), State machine (`rebased_clean`, `thenDone` from Done).
- `docs/architecture/worker.md`: the rebase flow.

## Tests (`apps/worker/src/rebase.test.ts`, real git, counts `agentCalls`)

- Clean, checks green: `agentCalls === 0`, the remote branch contains the base, the result is `ok` with `clean`,
  and the report says "cleanly".
- Up to date: no agent, no push, `clean`.
- Conflict: `agentCalls === 1`, the agent starts on the original commit with no rebase in progress, and its prompt
  names the conflicting file; the result has no `clean`.
- Clean, checks red: `agentCalls === 1`, the agent starts on the rebased commit and its prompt has the checks'
  output; no `clean`. If the agent fails, the branch is back at `before`.
- After a clean rebase, the next rebase with a conflict resumes the implementer's session, not a fresh one.

## Risk accepted

A clean rebase with green checks can still change behaviour (the base changed something the branch relies on and no
test covers it). Skipping the review trusts that plus the pull request's own human review. If that proves wrong, a
project setting could force the review after every rebase.

## Not in this plan

- The same "host first" idea for Restack ([restack.md](restack.md)), which rebases several branches.
- Revise with guidance after a failed rebase ([rebase-revise-with-guidance.md](rebase-revise-with-guidance.md)).
