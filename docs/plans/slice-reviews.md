# Plan: review a split ticket slice by slice

Status: built, steps 1 to 5 (branch `slice-reviews`, 2026-10-23). Not tried yet: a real revision of a split ticket
from a review with slice sections (it uses the user's Claude usage). "Not in v1" below is left.

## Idea

A ticket split into a stack ([spec](../spec/pr-stacks.md)) is reviewed on GitHub one pull request per slice, but
Union reviews it as one diff: comments are written on the whole stack's change, slices are read only in the commit
picker, and **Import from #n** reads only the ticket's own (top) pull request. The review page should follow the
stack: a slice picker, comments written on a slice's own diff, and the import pulling every slice's pull request,
each thread landing on the slice whose pull request it was written on.

## What Union has today

- `diff_commits` keeps a `slice` row per slice in the ticket's snapshot (`sha` = the slice's tip, its files = its
  own diff from the slice below). `ticket-commits.ts` serves them as `slice-<n>`; `commit-picker.tsx` lists them,
  read only.
- `review_comments` has no slice: a line comment is on the whole diff, anchored by `headSha` = the snapshot's head.
- `routes/review-import.ts`: `fetchFor` reads the discussion of `pickedPullRequest` (the ticket's own, or a slice's
  with `?pr=`); `review-import.ts` anchors every thread on the **whole** snapshot's patches. A thread from a slice's
  pull request (PR tab, slice picked) therefore lands on the wrong lines whenever a slice above changes the same
  file, and its old side is compared with the base instead of the slice below. This plan fixes that too.
- The review sent to the implementer (`review-feedback.ts`) says under each file which slices change it.

## Model (one migration)

- `review_comments.slice_position` (integer, null): the slice whose own diff the comment is on. Null: the whole
  change (an unsplit ticket, a current review, or a comment written on "All" of a split ticket).
- A slice comment's `headSha` is that slice's tip when it was written or imported. It is outdated when the newest
  snapshot's slice row at that position has another `sha` (as a whole-change comment is against the snapshot's
  head). A slice gone after a new split (no row at that position) makes its comments outdated too.
- Nothing else changes: `githubUrl` stays unique per ticket (a thread's URL names its pull request).

## Review page

```
← Back   Review: #42 Add billing     Import from the stack   Unified|Split   Send
 Stack   [ All | 1 #101 · 2 | 2 #102 | 3 #42 · 1 ]          ← slices bottom first, draft counts
 Files … diff of the picked slice, comments written on it
```

- A split ticket gets a slice picker under the header (the `Segmented` of `stack-tabs.tsx`, as Current reviews
  has): **All**, then each slice with its pull request and its draft count. Unsplit tickets are unchanged.
- **All** is today's page: the whole diff, its commit picker (without the slice rows, now in the picker above),
  and the whole-change comments.
- A slice shows that slice's own diff (the `slice` row's files), and comments can be written on it: the comment
  route takes `?slice=<n>` and builds its `CommentDiff` from the slice row (`patchOf`, tip as `headSha`). Only that
  slice's comments show there.
- General comments (imported reviews and conversation comments) show on their slice's tab.
- Grouping by spec, Explain and Review with agent stay on **All** in v1.

## Import from GitHub

- On a split ticket the header button becomes **Import from the stack**: one request that reads the discussion of
  every open slice's pull request (`ticket_slices.pr_number`, the top one being `tickets.pr_number`), bottom first.
  Merged and closed slices are skipped: their threads were dealt with on GitHub.
- Each thread is anchored on **its slice's** diff: `draftFromThread` gets a snapshot built from the slice row
  (its patches, its tip as head) instead of the whole one, and the draft gets `slice_position`. A thread whose
  lines are no longer in the slice's diff keeps GitHub's lines and excerpt and reads as outdated, as today.
- Review summaries and conversation comments (`importNote`) imported from a slice's pull request get its
  `slice_position` too.
- The PR tab's import with `?pr=<slice>` goes through the same code, so it lands on the right slice.
- The answer gives the counts per pull request: "#101: 2 imported · #102: none · #42: 1 imported, 1 resolved".
- A pure helper `sliceSnapshot(db, ticketId, position)` (new file next to `review-import.ts`, which is near the
  limits) returns the slice's `Snapshot`; `pullRequestSlice(db, ticket, number)` maps a pull request to its slice.

## Sending to the implementer

- One **Send** for the whole ticket (one implementer session), as today.
- `formatReview` groups the comments: the whole-change ones first (with "Changed in slice …" under each file, as
  now), then a `# Slice <n>: <title> (#<pr>)` section per slice with its files and comments, whose line numbers are
  the slice's tip's.
- The implementer's `# Stack` section gains one line: a comment under a slice is fixed in that slice (a commit
  ending with `Slice: <n>`, or a `fixup!` of one of its commits). The restack after the run already places them.

## Delivery

Each step passes `bun run check`; web and core only until step 4.

1. Migration `slice_position`; `sliceSnapshot` and `pullRequestSlice`; the import (threads and notes) anchored on
   the slice of the pull request it reads, which fixes the PR tab's `?pr=` import. Tests: a thread on a slice whose
   file a higher slice also changes lands on the slice's lines; a thread on a moved slice reads as outdated.
2. Outdated per slice in `listComments`; `?slice=` on the comment routes; the review page's slice picker, a slice's
   diff writable, comments filtered by slice, the slice rows out of the commit picker.
3. **Import from the stack**: every open slice's pull request in one request, the summary per pull request.
4. `formatReview` per slice, and the implementer's `# Stack` line (worker prompt: check `bun run active` before
   saving).
5. Spec: the Review section of `docs/spec/pr-stacks.md`; `docs/architecture/web.md` for the routes.

UI checks with `scripts/ui-check/` on a split ticket (writes blocked); the import against GitHub needs a split
ticket with comments on its slices' pull requests: ask before using a real project's.

## Decisions (recommended, to confirm)

1. Comments on **All** stay allowed: some remarks are about the whole stack.
2. A slice's comments do not show on **All**: their lines are the slice tip's, not the stack head's.
3. Merged or closed slices are not imported.
4. Comments of a slice gone after a re-split stay, outdated, on **All** with "slice <n> of an earlier split".

## Not in v1

- Review with agent filing its findings on slices (it already starts each finding with its slice; a `"slice": n`
  field in its block, as the stack run's `"pr"`, would let them land on the slice's diff).
- Grouping by spec and Explain on one slice.
- Re-anchoring an outdated slice comment on the slice's new tip.
