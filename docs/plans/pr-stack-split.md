# Plan: split a pull request into a stack

Status: investigated, not started. Depends on [ticket groups](ticket-groups.md). Restacking after merges and
revisions is its own plan: [restack](restack.md).

## Idea

When a ticket's PR is ready for review, the user can ask an agent to split it into a stack of smaller PRs, then
follow and review the stack in the UI.

## What Union already has

- Stacked branches: a ticket with a parent is cloned from the parent's branch (`ticketBase`), and its PR targets that
  branch with "after #N" in its description (`publish.ts`).
- Per-ticket review against the ticket's base, so a stacked ticket's review shows only its own changes; comments,
  "Review with agent", Revise and the PR tab work per ticket.
- The rebase step (agent resolves conflicts, force-push with lease) and the `behind_by` poll.
- The Merged column (`pr_state`, `pr_merged_at`).

## What is missing

- A way to rebuild one PR as several branches: agents may not create branches or rewrite history.
- A view of a stack as a whole.
- (Restack: see [restack](restack.md).)

## Design

1. **Plan.** "Split into a stack" is offered when the ticket is done and its PR is open and ready for review. A
   read-only agent proposes the slices: order, title and goal of each, which files and changes go where. The user
   edits and approves the plan, like the planning steps.
2. **Build.**
   - The worker prepares a fresh branch from the base, with the original branch readable.
   - The agent makes one commit per slice on it: no branch switching, no history rewrite, so the existing rule holds.
   - The worker checks that the last commit's tree equals the original branch's tree (nothing lost or added), else
     the split fails.
   - The project's checks run on each commit; a failing slice goes back to the agent (bounded attempts).
   - The worker creates one branch per commit, pushes them, and opens one PR per slice, each targeting the previous.
3. **Follow and review.**
   - Each slice is a ticket of the original ticket's group, chained by parent links, starting in In review at the
     final review: review, agent review, Revise and Rebase work per slice. Approving a slice marks its PR ready.
   - The group panel lists the slices in order with PR state, checks, "behind by" and review state; the review page
     gets previous/next slice.

## Open questions (with recommendations)

1. Union tickets only, or external PRs (Current reviews) too? Recommended: tickets only in v1 (external PRs have no
   ticket, container or plan behind them).
2. The original PR: close it with a comment linking the stack (recommended; the top slice's PR carries the issue
   link), or reuse it as the top slice (keeps its discussion, but it is force-pushed and its diff shrinks)?
3. Must every slice pass the project's checks? Recommended: yes, with bounded fix attempts (slower build).
4. Restack automatically after a merge or revision, or on a button? Recommended: button in v1 (it retargets PRs and
   force-pushes).

## Size

Plan, build, PRs and the stack view are the bulk: about the size of the Events feature, on top of groups.
