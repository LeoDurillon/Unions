# Ticket dependencies

A ticket can depend on one other ticket of the same project, its parent, set in the New ticket dialog or on the
ticket's Overview while it is in the backlog (`tickets.parent_ticket_id`; cycles are refused).

- **Start gate:** the child cannot start until the parent is Done. The check lives in core (`blockingParent`,
  called by `dispatch` on `start`), so the web refuses with 409, the worker refuses a queued start, and a move to
  In Progress made on GitHub is reverted (`start_blocked` event). The board shows "Waiting for parent" and the card
  cannot be dragged.
- **Branch:** at the child's first clone the worker picks its base (`resolveTicketBase`): the parent's branch while
  its pull request is open and the branch exists on GitHub, else the project's base branch. A parent whose PR is
  merged is already in it; one whose PR is closed is dropped, and the child's "Builds on" section says its changes
  are not in the code (`parent_pull_request_ended` event). The PR state is the one the worker last polled.
  While the ticket is in Backlog the user can choose its base in Overview (`tickets.chosen_base_branch`, any branch
  of the repository, checked on GitHub when saved); it wins over the parent's branch at the first clone, unless it is
  gone by then (`chosen_base_missing` event, automatic choice).
  Once started, the base changes only through a [change of target](retarget.md) from the PR tab, or when GitHub
  moves the pull request onto another branch (the parent merged and its branch deleted): the ticket
  [follows it](rebase.md#base-moved-on-github).
  The choice is stored in `tickets.base_branch` and used everywhere the project's base was: clone, the ticket
  branch's starting point, the review's `git diff <base>...HEAD`, the diff snapshot, and the PR base. A stacked PR
  says "Builds on #<parent PR>, which it targets: merge that one first."
- **Prompts:** every agent of the child gets a "Builds on" section with the parent's title and description.
- **GitHub:** once both issues exist, the worker marks the child's issue "blocked by" the parent's (REST issue
  dependencies, `github/dependency.ts`) and records it in `tickets.github_blocked_by`. Changing or removing the
  parent swaps or removes that relation. Local links win: dependencies edited on GitHub are not pulled back, and
  Union only removes the relation it added.
