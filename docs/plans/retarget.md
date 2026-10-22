# Change the target branch of a ticket

Status: built (2026-10-22, branch `retarget`); decisions D1 to D7 confirmed. Spec in
[`docs/spec/retarget.md`](../spec/retarget.md). Built as planned, except: the web queues it with its own route
(`POST /api/tickets/:id/retarget`, which reads GitHub for the branch) rather than the generic commands route; the
old base's commits are checked by commit and by patch (`git cherry`) rather than by count, since the agent may add
a fix commit; the Overview row only says where to change the target; `retarget_branch` is not cleared on cancel
(a new retarget overwrites it). Not tried yet on a real project.

## Why

A ticket's base is fixed at its first clone (`tickets.base_branch`, [ticket dependencies](../spec/ticket-dependencies.md)):
Overview lets the user choose it only in Backlog. A small fix built on `develop` sometimes turns critical and must
ship as a hotfix on `main`. Today the user moves the commits by hand and edits the PR's base on GitHub, and Union
still believes the ticket is on `develop` (behind count, review diff, later rebases).

## Design in short

- The ticket's PR tab, next to the behind count, gets **Change target**: a branch picker (the repository's
  branches, as Overview's base picker lists them) and **Retarget**. Same availability as Rebase: at the final
  review, or Done with the PR open.
- The host moves only the ticket's own commits: `git rebase --onto origin/<new> <upstream>`, where `<upstream>` is
  where the branch left its current base (`git merge-base HEAD origin/<old>`). The commits `develop` has and `main`
  lacks stay behind.
- Clean, and the checks pass: the host force-pushes (with the lease), sets the PR's base on GitHub to `<new>`, and
  the ticket's base becomes `<new>`. No agent runs.
- A conflict, or checks that fail after a clean move: the implementation agent is called, in its own session, as
  for a rebase, told which commits to move and onto what. Then the host checks, pushes and retargets the PR, and the
  final review runs again.
- On any failure the branch is left as it was, unpushed, and the PR still targets the old base.

It is the [rebase](../spec/rebase.md) with a different base and `--onto`: the code path already exists for a
restack (`Rebase.restack.upstream`, `tryHostRebase`'s `onto`).

## Decisions (proposed)

- **D1. Open pull requests only.** A merged PR cannot be retargeted on GitHub. Backporting a merged change (a new
  branch from `<new>`, its commits cherry-picked, a second PR) is left for later; the button says why it is off
  ("The pull request is merged").
- **D2. The old base is the PR's base on GitHub now**, read by the worker when the step starts, not
  `tickets.base_branch`: GitHub retargets a child's PR by itself when its parent's branch is deleted after a merge,
  so Union's record can be stale. If that branch is gone from GitHub too, the step fails ("the current base
  `<old>` no longer exists: rebase first").
- **D3. Final review as for a rebase**: it runs again only when the agent changed code. A clean move keeps the
  review from before (same commits, new base), and a Done ticket stays Done.
- **D4. Order on GitHub: push, then retarget.** Retargeting first would show `<new>..<old>` in the PR until the
  push. If the PR base update fails after the push, the step fails with GitHub's reason; **Retry** finds the branch
  already on `<new>` (up to date, nothing pushed) and only retargets.
- **D5. Where the target is kept.** The command's payload carries `{ branch }`; the worker stores it in a new
  column `tickets.retarget_branch` when it accepts the command, so a retry (or a resume after a refused commit)
  knows it. Cleared on success, cancel, or a new retarget. On success `base_branch` and `chosen_base_branch` both
  become `<new>`, so Overview shows it as chosen.
- **D6. Not for a split ticket.** A stack's slices would all move (`--update-refs`) and each lower PR retarget:
  refused in v1 ("split it again on the new base"), like Simplify.
- **D7. The web checks before queueing**: the branch exists on GitHub (`OnboardingGitHub.hasBranch`, as Overview
  does), differs from the current base, is a branch name, and the PR is open. The worker checks the PR again.

## State machine (`states.ts`, `phases.ts`, pure, with tests)

- New step `retarget` (a `Step`, not a pipeline step), shown on the board as In review; model and effort of the
  implementer, like `rebase`.
- New action `{ type: 'retarget' }` (the branch is not in the phase: D5), from `awaiting_approval` on
  `final_review` → `running('retarget')` with `thenRun: 'final_review'`; from `done` → the same with
  `thenDone: true`. `running()` treats `retarget` like `rebase`.
- `rebased_clean` is accepted from `running` on `retarget` too (back to review, or Done).
- Retry from `failed` on `retarget`, `commit_refused`, `rate_limited`: as for `rebase`, flags kept.
- `states.test.ts`: retarget from review and from Done, clean and agent outcomes, refused from other phases, a
  retry keeps `thenDone`.
- `event-payloads.ts`: `ticket_retargeted { from, to, pr }`, and the command's payload type.

## Worker

- `retarget.ts` (new, `runRetargetStep`): reads the PR's base and checks it is open (D1, D2), refuses a split
  ticket (D6), then calls `runRebaseStep` with `base: <new>` and an `onto` computed after the fetch. Keep it small:
  `rebase.ts` and `rebase-attempt.ts` are near their limits.
- `fetchIntoContainer`: the old base is fetched too (a ref that is only read, not checked like `extra`), so
  `merge-base HEAD origin/<old>` works in the container.
- `Rebase` gets `retarget?: { from: string; upstream: string }`; `attempt` passes `onto: upstream` to
  `tryHostRebase`, and a `retargetHint(from, to, upstream)` replaces `stoppedHint`'s command in the agent's prompt
  ("move only the commits after `<upstream>`: `git rebase --onto origin/<new> <upstream>`; the commits of `<old>`
  must not come along").
- Extra check after the agent (`rebaseProblem`): `origin/<new>` is in the history (already checked) and the
  branch has no more commits over `origin/<new>` than it had over `origin/<old>`, so `develop`'s own commits were
  not carried over.
- After the push (`afterPush`): `updatePullRequestBase(pr, <new>)`, then `base_branch`, `chosen_base_branch`,
  `retarget_branch = null`, `behind_by` recomputed by the next poll, the diff captured against `<new>`, the event.
  The report (host's or agent's) says "Retargeted #<pr> from `develop` to `main`" with the commits moved, and
  becomes the step's issue comment.
- A PR description that says "Builds on #<parent PR>" (stacked on a parent) no longer holds: the line is removed
  from the body when the old base was the parent's branch.
- Children: a ticket built on this one's branch keeps its base; its next rebase follows the moved branch.

## Web

- `POST /api/tickets/:id/commands` with `{ type: 'retarget', branch }` (D7 checks in `ticket-command-checks.ts`).
- `pull-request/branch-status.tsx`: **Change target** opens the picker (reuse the Overview picker component and
  `GET /api/tickets/:id/branches`), hint: "Only this ticket's commits move to the new branch, then the pull request
  targets it. The implementation agent is called only for conflicts or failing checks." Shown while the
  ticket can be rewritten, even when the branch is up to date.
- Overview's base branch row (fixed after start) links to it: "Change target in the PR tab".

## Tests

- `states.test.ts` as above.
- `retarget.test.ts`, real git like `rebase.test.ts` (counts `agentCalls`): a branch on `develop` (which has a
  commit `main` lacks) moved to `main` cleanly: no agent, the remote branch has the ticket's commits over `main`
  and not `develop`'s, the PR base updated (fake API), `base_branch` is `main`. A conflict with `main`: one agent
  call, its prompt names `<upstream>`. Failing checks after a clean move: one agent call. Retry after a failed PR
  update: nothing pushed, only the retarget. A split ticket and a merged PR are refused.
- UI check (`scripts/ui-check/`): the picker, the command queued with the branch.

## Not in this plan

- Backporting a merged PR to another branch (D1).
- Retargeting a stack (D6).
- Retargeting from GitHub (the user edits the PR's base there): the poll could notice it and offer the move.
