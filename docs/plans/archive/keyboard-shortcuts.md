# Plan: keyboard shortcuts and the next ticket that needs you

Status: built (2026-11-04, commit `5e0d584`). Checked in headless Chromium against the live data (every key, `n`
then `p` back to the same ticket, no write tried). Left: Approve / Revise keys (see Decisions).

## Idea

Union had no keyboard use beyond Escape. Working through a queue of approvals meant going back to the board and
finding the next card each time.

## Built

| Where       | Key       | Action                                         |
| ----------- | --------- | ---------------------------------------------- |
| Anywhere    | `?`       | The list of shortcuts (`shortcuts-help.tsx`)   |
| Board       | `/`       | Focus the search                               |
| Board       | `c`       | New ticket (project page only, no ticket open) |
| Board       | `n`       | Open the first ticket that needs you           |
| Ticket      | `n` / `p` | Next / previous ticket that needs you          |
| Ticket      | `r`       | Review changes (when the ticket has a branch)  |
| Ticket      | `1`–`4`   | Overview, Preview, Worker, PR                  |
| Ticket      | `Esc`     | Close the panel                                |
| Review page | `j` / `k` | Next / previous file, in the list's order      |

The ticket panel's header has **Next needing you** with the count of other tickets waiting, in the board's order
(column by column, wrapping around; `lib/next-needing.ts`, using `needsYou` from `board-filter.ts`).

How keys are taken: `useShortcuts` (`client/lib/shortcuts.ts`), one listener per part. No key counts when typed in
a field, with Ctrl, ⌘ or Alt, held down, already handled, or while a `<dialog>` without `data-shortcuts` is open
(the ticket panel has the attribute). Owners: `lib/use-board-keys.ts` (only while no ticket is open),
`components/ticket-panel-keys.ts` (not on the review page), `review/use-file-keys.ts`, `shortcuts-help.tsx`
(mounted by `main-area.tsx`). Escape inside a dialog opened from the panel no longer also closes the panel.

## Decisions (2026-11-04)

- No single-key Approve or Revise: approving starts the next agent step and spends Claude usage, so a stray key
  would cost a run. If wanted later: a key that focuses the Approve button, so a second key confirms.
- No auto-advance after an approval: the Next button and `n` leave the choice to the user.
- `j` / `k` follow the file list as shown (tree order in Tree), the ignored files last; with By spec on they use
  the plain order.

## Keep in step

A new shortcut goes in the owner's hook, the list in `shortcuts-help.tsx`, and the table in
`documentation/tickets.md`.
