# Stacks of pull requests

A ticket whose pull request is too big to review is split into a stack of pull requests, one per part of its spec,
each merged on the one below. The stack stays one ticket: one branch, one container, one session, one card, one
issue. Plan and decisions: [docs/plans/pr-stack.md](../plans/pr-stack.md). Built: splitting an existing pull
request (part A); slices declared by the plan (part B) are not built.

Split into a stack is offered only on projects that turn on **Split pull requests into stacks** (project settings
→ Pull requests, off by default) while stacks are new; **Check every slice** (on by default) runs the project's
checks on each slice's tip when splitting.

## Model

- A **slice** is a part of the spec and a run of consecutive commits on the ticket's branch: the commits after the
  tip of the slice below, up to its own tip. Rows in `ticket_slices`, bottom first (`position` 1); a split ticket
  has two or more, a ticket without rows is not split.
- The **top slice is the ticket's own branch and pull request** (`tickets.branch`, `tickets.pr_number`), retargeted
  onto the slice below. The lower slices' branches are `<branch>-s<position>`.
- A slice records its tip as last pushed (`tip_sha`), its pull request and state, and once merged the branch it was
  merged into (`merged_into`) and its tip then (`merged_tip_sha`, cleared once the rest was restacked).

## Split

While the pull request is open, the PR tab shows **Split into a stack**, usable at the final review or once Done.

1. **Plan:** a read-only agent (`split_plan`, Union settings → Split plan, the final review's tools, a fresh
   session) reads the spec, the diff and the commits, and writes one `## Slice <n>: <title>` section per slice with
   its `**Spec:**` (the slice's PR description), `**Changes:**` and `**Stands alone:**` (why it builds on the slices
   below and is safe to ship before those above). A plan the host cannot read gets one more turn in its session.
   It waits in the Worker tab: **Approve and split**, **Request revision**, **Edit**, or **Drop the split** (back
   to where it was asked).
2. **Split:** the implementer's session is resumed with the `split` prompt and the approved plan. It rewrites the
   commits into the slices, each commit ending with a `Slice: <n>` trailer, in order. The host first fetches the
   ticket's branch and any slice branch already on GitHub, and stops when one has commits the workspace lacks.
3. **Checks by the host:** as for [Simplify history](simplify-history.md) (on the branch, nothing uncommitted, the
   same fork point, the same tree), plus every commit's trailer in order and every slice with a commit, plus the
   project's checks on each lower slice's tip. Problems go back to the same session, up to twice; then the step
   fails and the branch is put back, unpushed. A hook refusing a commit fails the split too.
4. **Publish:** the lower slices' branches are set at their tips and pushed with the ticket's branch in one
   `git push --atomic`, each with `--force-with-lease` (a new branch must not exist yet). Then a draft pull request
   is opened (or reused) per lower slice on the slice below (ready for review when the ticket's already is), the
   ticket's pull request is retargeted onto the slice below it, each lower slice's description is written: the
   split's session, resumed with the PR description agent's settings, fills in the repository's pull request
   template (as for [the ticket's own](pull-requests.md); a plain summary without one) for that slice's change
   alone, then Union adds the stack and `Part of #<issue>` (no `Closes`); a slice whose turn fails gets its title
   and its part of the spec instead, the ticket's own description gets a
   stack section, the issue gets one comment listing the stack, and `ticket_slices` is replaced. The pull
   requests are then made a **GitHub stack** (`POST /repos/{o}/{r}/stacks`, bottom first, API version
   `2026-03-10`), whose number is kept on the ticket (`github_stack_number`). GitHub refuses to change the base
   of a pull request in a stack, so an earlier split's stack is unstacked before the pull requests are
   retargeted, and Union never retargets a GitHub stack's pull requests after a merge. Where GitHub has no stacks (a 404: GitHub Enterprise Server), Union keeps the stack alone.
   What GitHub
   refuses after the push is listed in the report: the split stands. A slice branch of an earlier split with no
   use left is reported, not deleted.
5. **After:** the code is the same, so the ticket returns to its final review, or to Done. Approving the final
   review marks every slice's pull request ready. Simplify history is refused on a split ticket: split it again.
   The PR tab shows each slice's pull request the same way (picked above its sections). **Rewrite all
   descriptions** rewrites each open slice's description about its own change, one after the other; each draft is
   reviewed and sent from its pull request, with the stack and `Part of #<issue>` added back.

## Revise and rebase

- The implementer's prompt gets a `# Stack` section: the slices, their commits, and how to place a new commit
  (`Slice: <n>` to add it at the end of slice n, `fixup! <sha>` to fold it into that commit).
- After its run, the host moves the new commits into their slices with `git rebase -i` and its own todo
  (`pick`, `fixup`, `update-ref` for the lower slices' branches). A commit it cannot place is asked about in the
  implementer's session (`<sha> Slice: <n>` or `<sha> fixup! <sha>`). The tree must not change; then every slice is
  pushed atomically, leased on its recorded tip, and the tips are recorded again. A conflict while reordering fails
  the step, unpushed.
- A rebase fetches the lower slices' branches too, starts them at their recorded tips and rebases with
  `--update-refs` (the rebase agent is told to); a slice branch left behind refuses the push. The stack is pushed
  together.

## Review

- The diff snapshot also holds each slice's own diff (`slice` rows of `diff_commits`). The review page shows the
  slices as tabs under its header: **All** (the whole stack's diff, with its commit picker, the grouping by spec
  and Explain), then each slice with its pull request and its drafts. A slice's tab shows its own change, and
  comments are written on it (`review_comments.slice_position`, `head_sha` the slice's tip); they go out of date
  when that slice's tip moves. All shows the whole-change comments, and those of slices a new split removed.
- The review sent to the implementer says, under each file, which slices change it.
- Comments imported from a slice's pull request (the PR tab with that slice picked) land on that slice's own diff,
  as GitHub shows them. Plan for the rest: [slice-reviews.md](../plans/slice-reviews.md).
- **Review with agent** on a split ticket gets each slice's range (`git diff <below>...<tip>`) and part of the
  spec, and is asked to start each finding with its slice.

## Merge

- The user merges from the bottom, on GitHub; on a GitHub stack, GitHub enforces it (merging a pull request in
  the middle lands every one below it). The worker polls the slices: on a GitHub stack with one call
  (`GET /stacks?pull_request=<top>`, a merged one went into the stack's base) plus the bottom open pull request
  on its own, for `behind_by` against the base.
- The ticket is merged only once every slice is merged into the base: then its issue is closed and the usual
  "PR merged" event fires. A slice merged into another slice's branch (out of order) leaves the ticket open and
  is shown in the PR tab; so is a slice closed without a merge, where the stack stops.
- On a **GitHub stack**, GitHub rebases the rest of the stack onto the base itself after a merge and retargets
  the next pull request (tried 2026-10-20: within seconds, onto the squash commit). Once the next pull request
  targets the base, the worker starts `restack` (`hostOnly`), which **follows GitHub**: it fetches the open
  slices' branches, checks GitHub's branch holds the base, resets the workspace's branches to them and records
  the tips, with no push and no agent (`stack_followed`). A workspace holding commits GitHub does not have is
  refused. When GitHub has not rebased (a conflict: tried 2026-10-20, GitHub still merges the bottom slice and
  retargets the next pull request, but leaves its branch as it was), the worker's run fails, nothing pushed,
  and the user's Restack (or Retry) rebases with Union: `--onto` the merged tip, the rebase agent resolving the
  conflict, the open slices force-pushed; GitHub keeps the stack.
- On a stack **Union keeps alone**, when a slice merges into the base and others remain, the worker starts
  `restack` on its own (`hostOnly`, when the ticket is at its final review or Done): `git rebase --onto origin/<base> <merged tip> --update-refs`, so the
  merged commits are not replayed even after a squash merge, the checks, then the open slices are pushed together
  and the new bottom pull request is retargeted onto the base. Started by the worker, it never calls an agent: a
  conflict or failing checks fail the step, nothing pushed, and the PR tab's **Restack** (or **Retry**) runs it
  again with the rebase agent resolving it, after which the final review runs again.
- The card shows `Stack of 3 · 1 merged`; the PR tab lists the slices with their pull requests and states.

## State machine

Steps `split_plan`, `split` and `restack` are `Step`s outside the pipeline, shown In review. From
`awaiting_approval` on `final_review` or from `done` (with `thenDone`):

- `split` → `running` `split_plan` → `awaiting_approval` `split_plan`; there `approve` → `running` `split` →
  back; `revise` plans again; `drop_split` goes back.
- `restack` (`hostOnly` when the worker starts it) → `running` `restack` chained to `final_review`;
  `rebased_clean` goes back, `run_finished` (an agent changed code) runs the final review.
