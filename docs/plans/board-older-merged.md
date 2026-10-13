# Idea: show older merged tickets

Status: idea, not started.

The board's Merged column drops a ticket 21 days after its PR was merged (`leftBoard`, `MERGED_VISIBLE_MS` in
`packages/core/src/states.ts`). The ticket is not deleted, but nothing in the app lists it any more.

Options:

- A "Show older merged tickets" toggle on the board (per-viewer, remembered in `localStorage`) that keeps them in the
  Merged column.
- Or a "Merged" list/search view (title, PR, merge date) reachable from the project bar.

Related: [exclude merged PRs from the ticket view](exclude-merged-prs.md).
