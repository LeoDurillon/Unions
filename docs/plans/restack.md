# Plan: restack a stack after a revision or a merge

Status: idea, not started. Follows [splitting a PR into a stack](pr-stack-split.md); also useful for parent/child
tickets planned up front.

## Problem

- The base branch of a ticket is chosen once, before its first clone (`resolveTicketBase` in `ticket-base.ts`).
  Nothing updates the tickets above when the one below changes or merges.
- The worker's GitHub client has no call to change a PR's base branch.

## Design

- **After a revision** of a slice, the slices above need rebasing in order. A "Restack" action on the group chains the
  existing rebase step, bottom to top, stopping at the first failure.
- **After the bottom PR merges** (seen by the `pr_state` poll), Union retargets the next PR to the base branch (new
  GitHub API call to update a PR's base), updates that ticket's `base_branch`, and moves its branch onto the base.
- **Squash merges:** the next branch still contains the bottom slice's original commits. Union records each slice
  branch's tip when it is pushed, so it can run `git rebase --onto <base> <old bottom tip> <branch>`: mechanical, no
  agent needed unless there is a conflict (then the rebase agent takes over).
- Every force-push keeps using `--force-with-lease`.

## Open questions

- Automatic after a merge, or a button (recommended for v1: button, since it retargets PRs and force-pushes)?
- If GitHub already retargeted the PR (it does when the merged base branch is deleted), detect and skip.
