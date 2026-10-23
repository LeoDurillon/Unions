# Change of target

A ticket's base is fixed at its first clone ([ticket dependencies](ticket-dependencies.md)). When a fix built on
`develop` must ship as a hotfix on `main`, the ticket's PR tab offers **Change target**: pick a branch, then
**Retarget onto `<branch>`**. Available at the final review, or once Done, while the pull request is open; not for
a ticket split into a stack (split it again on the new base). A merged pull request cannot change target.

## Flow

1. **Queued:** the web checks the move is allowed, the PR is open, the ticket is not split, and the branch exists on
   GitHub and is not the current base, then queues `retarget` with `{ branch }`. The worker keeps the branch in
   `tickets.retarget_branch` (for retries) and starts the `retarget` step.
2. **The base it leaves** is the pull request's base on GitHub now (GitHub retargets a child's PR by itself when
   its parent's branch is deleted); when GitHub already targets the new branch, the base it moved the PR off
   ([followed](rebase.md#base-moved-on-github)), else the ticket's own base. The new branch must exist on
   GitHub; the one left must too, or have a merged pull request, whose `refs/pull/<n>/head` stands for it.
3. **Host first:** as for a [rebase](rebase.md), the host fetches the old base, the new one and the pushed
   branch, then moves only the branch's own commits: `git rebase --onto origin/<new> <fork>`, where `<fork>` is
   `git merge-base <branch> origin/<old>`. The old base's commits that the new one lacks stay behind. Clean with
   passing checks: force-pushed with a lease, no agent, the final review kept (a Done ticket stays Done).
4. **Agent only when needed:** on a conflict, or failing checks after a clean move, the implementer's session is
   resumed with the rebase prompt, told the command and the fork point. The host then checks the result as for a
   rebase, and also that no commit of the old base came along (the same commit, or the same patch). Pushed, then
   the final review runs again.
5. **GitHub:** after the push, the pull request's base becomes the new branch, and Union's "Builds on #<parent PR>"
   line is removed from its description. The ticket's base (`base_branch`, `chosen_base_branch`) becomes the new
   branch: the behind count, the review diff and later rebases use it.

## Failure

Anything that fails before the push leaves the branch as it was and the PR on its old base; **Retry** runs it
again. If GitHub refuses the new base after the push, the step fails with GitHub's reason; **Retry** finds the
branch already moved (nothing to push) and only retargets. Accepted: when the agent had worked on that run, the
retry does not run the final review again.

## State machine

Action `retarget`, from `awaiting_approval` on `final_review` and from `done`, to `running` on the `retarget` step
with `thenRun: final_review` (and `thenDone` from Done), like `rebase`. `rebased_clean` is accepted from it too.
`retarget` is a `Step` outside the pipeline, shown In review, on the implementer's model, effort and session.
