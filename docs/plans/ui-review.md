# Plan: UI/UX review

Status: steps 1 to 4 built (2026-10-24); step 5 planned. From a review of every page
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

- [x] A `ghost` button variant and a shared `IconButton` (pencil, check, trash) for row actions; `ConfirmButton`
      takes an `icon` for a row's delete.
- [x] GitHub App Remove asks first (it is refused while a project uses the app). Memory ✕ needs no confirm: it
      only changes the draft, which Discard brings back.
- [x] Ticket header: Review changes is primary while the final review waits for the user. The Approve bar sticks
      to the bottom of the panel while idle, so it stays in reach along a long output (rather than a second copy
      in the header).
- [x] Review page, grouped by where each result lands (a first try put the three agent actions in one "Agent"
      group, which mixed two dialogs and a side panel): Review with agent beside Send review (its drafts are what
      Send sends); Explain beside Unified / Split (it toggles a panel); Group by spec as the file panel's
      "By spec" switch, which asks for a grouping when there is none and shows Grouping…, Cancel, a failure or
      Regroup under the header. Send review is primary only once there are drafts.
- [x] Event rules: an on/off switch, Edit and Delete as icons (Delete asks first), When and Then on their own lines.
- [x] PR tab: Change target, Simplify history and Split into a stack folded under "More actions", above the CI
      checks (Simplify history runs on almost every ticket).

## Step 3: navigation and layout

- [x] Review mode in the URL (`?review=1` beside `?ticket=`): reload keeps it, Back leaves it.
- [x] Collapsible sidebar: « folds it to an icon rail (projects by their first two letters, counts on the icons),
      remembered in this browser; folded at first under 1100 px wide.
- [x] Board: narrower columns (13 rem); any column folds to a strip with its count; Merged / Closed starts folded.
- [x] Update: a quiet small line while there is nothing to install (not hidden: Check now and the reason updates
      are refused stay); the full entry when an update waits.
- [x] "+ Add project" as a + beside the Projects heading (the button stays while there is no project).
- [x] Current reviews merged into Pull requests: an "Under review" part above the stacks and pull requests;
      removing a review asks first (its drafts and preview go). Spec and architecture docs updated.
- [x] "No GitHub access" as a banner under the project bar, with Set up access.
- [x] A ticket's review page gets Ticket, Preview and PR tabs (the panel's own views) beside Diff, and opens on
      Diff.
- [x] One spec choice per review: built as [its own plan](review-specs.md).

## Step 4: board

- [x] Search (every word in the title, `#issue` or `#PR`), **Needs you** with its count (a step to approve, a
      failure, a refused commit, red CI checks), and From Notion / From GitHub when some tickets came from
      Notion; "N of M" and Clear while filtering. Tickets have no labels, so there is no label filter.
- [x] Card titles clamped to 3 lines (whole on hover); one state pill ("Needs review · Final review"); the
      parent as a small "↳ after #…" chip.
- [x] Empty columns say so ("Nothing running", "None matches the filter").
- [x] A **Start** button on backlog cards that can start; the hint shows only while one can, and names both ways.

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
