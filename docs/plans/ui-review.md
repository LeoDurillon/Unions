# Plan: UI/UX review

Status: step 1 (quick wins) built on branch `ui-review` (2026-10-24); steps 2 to 5 planned. From a review of every page
of the live instance, light and dark, at 1400, 1024 and 390 px wide.

## Step 1: quick wins

- [x] Events › Activity as a table (when, status, rule, ticket, then the result); Notion member ids in the result
      shown as names.
- [x] Ticket panel: a modal `<dialog>` (focus stays in it); Escape closes it, except in a field.
- [x] Investigation Delete asks first (`ConfirmButton`, a quiet red button until confirmed).
- [x] Status pills never shrink (`Badge` is `shrink-0`).
- [x] A ticket's files: one line per file (name, size, private or allowed, note); Edit opens the note and the
      switch. New ticket's picked files start open.
- [x] Settings Save / Discard bar: already sticky with "Unsaved changes"; nothing to do.
- [x] New ticket: Title first, Flow after the files; dialogs and the wizard close with ✕ (`CloseButton`).
- [x] Notifications grouped by ticket or investigation: the latest entry, then "N earlier" folded; opening one
      marks the whole group read.

## Step 2: actions and hierarchy

- A quiet (ghost) button variant and icon buttons for row actions (edit, delete, move, turn off); outlined buttons
  only for real secondary actions.
- One destructive pattern: `ConfirmButton` for GitHub App Remove and Memory ✕, like investigation Delete.
- Ticket header: Review changes primary when a step waits for review; Approve / Revise reachable from the header.
- Review page toolbar: the agent actions in one menu (Group by spec, Review with agent, Explain); Send review
  secondary while it has no comment.
- Event rules: a toggle for on/off, Edit and Delete as icons, the condition and the action set apart.
- PR tab: CI checks and the description first; Change target, Simplify history and Split into a stack under
  "More actions".

## Step 3: navigation and layout

- Review mode in the URL (`?review=1` beside `?ticket=`), so reload and Back keep it.
- Collapsible sidebar (icon rail), and a board that fits narrow screens (narrower columns, Merged / Closed folded).
- Update button hidden unless an update exists.
- "+ Add project" as a small + beside the Projects heading.
- "Current reviews" as a section of Pull requests rather than its own tab.
- "No GitHub access" as a banner, not a small link.
- The review opened from a ticket gets the same tabs (Description, Comments, Preview, Diff) as one opened from
  Current reviews.

## Step 4: board

- Search and filters (text, origin, label); clamp card titles to 3 lines.
- One state pill per card ("Needs review · Final review"), a "child of #…" chip for sub-tickets.
- Empty column states; the drag hint only while it helps, or a Start button on backlog cards.

## Step 5: pages

- Help text: one short line per field, the rest behind an ⓘ or a "Learn more".
- Pull requests: skeleton rows while loading; fixed right-hand columns for the stats and the actions; a visible
  "Review" action instead of a hover-only one.
- Current reviews: the row opens the review; Remove as an icon; the hint in the empty state.
- Running previews: service chips ("api ↗") with the URL on hover; an empty state.
- Investigations: hide "done" in the list; tool chips show the selected tools plus "Add tool…" (agent pages too);
  answer tables scroll visibly.
- Notifications: say what Clear does; fold the desktop-notification footer once seen.
- Review page: file paths truncated in the middle; Tree by default when many files share a prefix.
- Settings: Notion group renamed Integrations; base branch picked with the branch picker; Iteration limit as a
  number input; Flows show Implementation and Final review as locked chips and cannot remove the default flow;
  a taller compose editor; Tools page says which tools are built in.
- Log: run stats on their own line.
