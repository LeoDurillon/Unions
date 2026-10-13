# Idea: exclude merged PRs from the ticket view

Status: idea, scope to clarify.

The user's words, when the guard against reviewing merged PRs was added: "later on we will exclude merged PR from the
ticket view". At the time Union added `tickets.pr_state` (open, closed, merged), polled by the worker, so the filter
is `prState === 'merged'`.

Since then the board gained the Merged column (merged tickets leave the other columns, and the board after 21 days).
To clarify before building: which view is meant (the board, the project bar's Pull requests list, or another list),
and whether the Merged column already covers it.

Related: [show older merged tickets](board-older-merged.md).
