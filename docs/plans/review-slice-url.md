# Plan: the review page's slice in the URL

Status: steps 1 and 2 built (branch `review-slice-url`, 2026-10-28); step 3 (the pull requests under review in
the URL) left.

## Idea

A split ticket's review page shows one slice at a time (the tabs under the header: All, 1, 2, 3…), but the
picked slice is React state (`useState` in `use-slice-view.ts`). Browser Back from slice 2 leaves the review
page altogether, a reload falls back to All, and a link cannot point at one slice. The page should keep the
slice in the URL, `?ticket=3&review=1&slice=2`, so each pick is a history entry: Back goes to the slice shown
before, Forward comes back, a reload keeps it.

## What Union has today

- `lib/url-state.ts`: `setParams` pushes one history entry and fires `union:navigate`; `useUrlParam` reads a
  parameter and follows `popstate` too. The open ticket (`?ticket=`) and its review (`?review=1`) already use it
  (`lib/use-selected-ticket.ts`), as do settings, investigations and the Previews page.
- `lib/use-slice-view.ts`: `picked` is local state; a position no longer in the stack (after a new split) shows
  All. `setSlice` is handed to the slice tabs (`slice-tabs.tsx`) and, through `SlicePickProvider`
  (`slice-pick.tsx`), to the PR tab's pull-request picker (`pull-request-tab.tsx`), which sets the slice whose
  pull request is picked.
- `review-page.tsx` remounts `DiffArea` on `key={slices.slice ?? 'all'}`, so a slice change already starts with no
  file open; that stays.
- The pages that leave the ticket clear `review: null` by hand: `useSelectedTicket`, `settings-sections.ts`,
  `union-settings-sections.ts`, `investigate-ticket.ts`, `opened-investigation.ts`.

## Design

- One parameter, `slice`, the slice's position (`1` = bottom). Absent: All. It means something only with
  `review=1` on a ticket; the pull requests under review (no ticket) never read it.
- `use-slice-view.ts` reads it with `useUrlParam('slice')` instead of `useState`; `setSlice(n)` becomes
  `setParams({ slice: n === null ? null : String(n) })`. Nothing else changes for the tabs, the PR tab or
  `SlicePickProvider`: they already go through `setSlice`.
- Parsing in a small pure helper (`lib/slice-param.ts`, `slicePositionOf(value)`: a positive integer, else null),
  with a test. An invalid value or a position gone after a new split shows All, as today; the URL is left as it
  is (no rewrite, no extra history entry).
- Picking the slice already shown does nothing (no duplicate history entry): `setSlice` compares with the current
  value first.
- Closing the review or the ticket clears the slice with it. `use-selected-ticket.ts` exports
  `CLOSE_REVIEW = { review: null, slice: null }`, and every call that set `review: null` spreads it instead, so
  a stale `slice` never comes back when another ticket's review opens.
- Back across slices stays inside the review page; one more Back past the first slice shown closes the review
  (`review=1` goes), as it does today.

## The section tabs (Diff, Description, Preview, PR, Report)

With only the slice in the URL, Back mixes two kinds of moves: open the PR tab, pick slice 2, press Back, and the
page shows All but stays on the PR tab. Step 2 puts the section tab in the URL too (`?tab=pr`, absent = the page's
`startOn`), from `useSectionTab` in `review-page.tsx`, so Back undoes the last click whichever row it was on. The
pull request review page (no ticket) gets it too, since it uses the same `ReviewPage`; it is not in the URL yet,
so there the parameter only takes effect once step 3 is done, and the tab state stays local until then.

## Steps

1. The slice in the URL: `slice-param.ts` and its test, `use-slice-view.ts` on `useUrlParam`, `CLOSE_REVIEW` in
   the five places that close the review. Check by hand (or `scripts/ui-check/`) on a split ticket: tabs, PR tab
   picker, Back, Forward, reload, close then open another ticket's review.
2. The section tab in the URL (`tab`), cleared by `CLOSE_REVIEW` as well. `key` on the review page's tab state so a
   tab that does not exist on this page (a stale `tab=report` on a pull request review) falls back to `startOn`.
3. Optional, separate: the pull requests under review in the URL (`?review-pr=<n>` in `under-review.tsx` instead
   of `useState`), so the stack tabs of a reviewed stack (`stack-tabs.tsx`, `onPick`) get Back and Forward the same
   way. It touches the Pull requests page's own navigation, so it gets its own check.

Each step updates `documentation/branches.md` (the review page paragraph): Back and Forward move between the
slices you looked at, and the address of the page keeps the slice.

## Not in v1

- The open file in the URL (`?file=`): the file list is per slice and the diff remounts on a slice change, so it
  would need its own fallback when the file is not in the slice.
- Replacing rather than pushing on a click (`replaceState`): the point of the change is that each pick is an entry.
