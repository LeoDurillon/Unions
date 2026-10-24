# Plan: UI/UX review

Status: steps 1 and 2 built (2026-10-24, branches `ui-review` and `ui-review-2`); steps 3 to 5 planned. From a review of every page
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
- [x] Review page: Group by spec, Review with agent and Explain in one quiet "Agent" group (not a menu: their
      progress and Cancel stay in view); Send review is primary only once there are drafts.
- [x] Event rules: an on/off switch, Edit and Delete as icons (Delete asks first), When and Then on their own lines.
- [x] PR tab: Change target, Simplify history and Split into a stack folded under "More actions" after the
      checks, the description and the discussion.

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
