# Plan: agent reviews of large changes, slice by slice

Status: planned (2026-11-13); step 0's recording built (branch `review-agent-logs`), the rerun of #1756 left.

## Problem

On a large change (from about 1000 to 1500 changed lines), **Review with agent** loses its way: it comments on the
first files, skims the rest, and misses what lies between them.

The agent review (`apps/worker/src/review/agent-review.ts`) is one agent with one prompt: "compare the change with
`git diff <base>...HEAD`". It runs with `hunkIndex: false`, so unlike the other review agents it gets neither the
list of changed files nor the hunk index (`checkedOutChange` in `review-change-prompt.ts`). On a large change it
probably reads the whole diff in one call, the output fills its context, and it reads the end less closely. This is
inferred from the prompt; step 0 checks it against real logs.

What already exists to build on:

- **Group by spec** (`review-grouping.ts`) splits a change by part of the specification: whole files, or single
  hunks for a file split between parts, plus `unrelated` (changes no spec asked for) and `missing` (spec parts
  nothing implements). `review-grouping-result.ts` checks that only real hunks are named and that every hunk is
  placed at least once. A grouping records the head it read (`headSha`).
- The hunk index (`HUNK_INDEX`, `hunk-index-file.ts`), written into the checkout for the other review agents.
- A stack's agent review already reviews several pull requests in one run (`agent-review-stack.ts`).

## Step 0: measure

### What PR #1756 shows (2026-11-13)

Agent review 23 of the pull request #1756 (review 51, project 1): 77 files, 3721 lines added and 907 removed,
5.3k characters of specs. The run took 4 min 20 s and left 6 drafts, all kept and sent. They are good: two
blocking bugs (the author's name leaking into a file clients can download, and unpublishing that checks only
the current mode) and three real smaller issues.

Where those 6 comments landed:

| Area                                    | Changed lines | Files | Files commented |
| --------------------------------------- | ------------- | ----- | --------------- |
| `goreno/simulator`                      | 1605          | 20    | 0               |
| `goreno/api`                            | 1111          | 12    | 2               |
| `goreno/conception`                     | 889           | 25    | 1               |
| `goreno/packages/financial-engineering` | 593           | 9     | 0               |
| `goreno/e2e`                            | 230           | 3     | 0               |
| `docs`                                  | 172           | 4     | 0               |

The agent went deep on the API's publication path and found real bugs there. It said nothing about the simulator
(the largest area, with `useActionsDetailsData.ts` alone 487 changed lines) nor about the new
`publishedProgramme.ts` (369 lines) of the shared package. That is the pattern this plan is for: depth on one part,
silence on the rest. With one pass, silence does not tell "read and fine" from "never read".

How it read the diff cannot be checked. A pull request's agent review keeps **no log** (`agent-review.ts`: "A pull
request review has no log view") and writes **no `agent_usage` or `agent_tool_usage` rows** (none exist with
neither a ticket nor an investigation). Its throwaway container is gone after the run.

### To do

- Built: a pull request's agent review records its log in `agent_log`, and its `agent_usage` and
  `agent_tool_usage` rows, by `agent_review_id` (migration 0089; a ticket's review gets both ids). Nothing shows
  them yet; the project's Usage page still leaves them out. Without this, neither step 1 nor step 2 can be
  measured on pull requests, which is where large changes come from.
- Ask the agent, in its `summary`, which files it read closely and which it skimmed (step 1 does this). A cheap
  signal while the log is missing, and still useful after.
- Rerun PR #1756 once the log is recorded (with the user's consent: it uses Claude usage), to get the before figures:
  tool calls, how the diff was read, peak context, files commented by area.

## Step 1: give the agent review a map of the change (cheap, every size)

- Use `checkedOutChange` in `agentReviewPrompt` (and in the stack's prompt) instead of its own paragraph: the list
  of changed files, "read the diff one file at a time when it is large", and the hunk index. Set `hunkIndex` to
  true (or wrap the work in `withHunkIndex`).
- Put generated files (lockfiles, `*.snap`, `dist/`, files marked `linguist-generated` in `.gitattributes`) in a
  short "skim only" list rather than the main file list. Put the matching rule in core as pure code (one list for the
  threshold below too), with tests.
- Ask the agent to read the files in an order that follows the change (entry points first), and to note in its
  `summary` the files it did not get to, if any.
- Then rerun step 0's pull requests and compare. If this is enough up to some size, raise the threshold of step 2.

## Step 2: a sliced review above a threshold

**Deciding to slice**

- The size is the changed lines of the files that are not generated (step 1's rule). The threshold is a project
  setting, **Review in slices above** (default 1200 lines; 0 turns it off), on the Agents settings next to the
  review agent.
- On the review page, above the threshold, **Review with agent** asks **In slices** (the default) or **In one pass**,
  as the stack review already asks **The whole stack** or **This pull request only**. Below the threshold, nothing
  changes.

**Stage 1: the slices**

- If the change has a succeeded grouping whose `headSha` is the current head, reuse it and run no agent for this
  stage.
- Otherwise, with specs: run a grouping first, as Group by spec does. It is saved like any grouping, so the user
  sees it on the page afterwards.
- Without specs (or when the grouping fails): group by folder, without an agent. Use the deepest common folders that
  give slices of a few hundred lines each. A pure function in core, with tests.
- Turn groups into slices: each hunk is **owned** by one slice (its first group), and a group that owns too little
  (under ~50 lines) is merged into its neighbour. `unrelated` is a slice of its own. `missing` is passed to the
  final pass, not reviewed.
- Cap the slices (8 to start with, a named constant). Above the cap, merge the smallest neighbours.

**Stage 2: one agent per slice**

- Each slice agent gets the shared prompt, the review agent's prompt, the specs, and the whole change's map
  (step 1). Then it gets **its slice**: the spec part quoted, the group's summary, and the hunks it owns.
- It is told to review its hunks and comment only on them, but it may read any file and any other hunk to follow a
  call. Focus without blinders: a bug often sits where its slice meets another one.
- Its answer is the usual `FINDINGS_FORMAT`. Comments on lines outside its owned hunks are dropped (they belong to
  another slice), except in its `summary`.
- Slices run one after another in the same throwaway container (one checkout and one install), each in a fresh
  session. They take one run slot like today's review, so a sliced review does not crowd out the tickets. Running
  them in parallel is left for later.

**Stage 3: the seams**

- One more agent, in a fresh session, gets: the slices (titles, specs, owned hunks), each slice's findings, the
  `missing` parts, and the list of symbols changed in one slice and used in another (a `git grep` of the changed
  functions' names, done by the worker before the run).
- It looks only at how the slices fit together: callers and callees changed apart, contracts, migrations against
  the code using them, missing parts. Its comments are added; it does not repeat or remove the slices' comments.
- Its `summary` becomes the review's remark on the whole change, with one line per slice.

**Merging**

- Drafts are pooled. Duplicates (same path, overlapping lines, same side) are kept once: the slice owning the hunk
  wins over the seam pass. The 30 comments cap (`MAX_COMMENTS`) applies per slice, plus a total cap (60 to start
  with).
- A failed slice does not fail the review: its comments are missing, and the summary says which slice failed and
  why. The review fails only if every slice fails.

**Records and UI**

- `agent_reviews` gets a `mode` (`single` or `sliced`) and the slices' progress (a JSON column: title, status,
  comment count). A migration.
- The agent review's card shows the slices while it runs ("Slice 3 of 6: Automatic unpublishing") and, once done,
  the comments per slice. Each draft says which slice wrote it, as a small label.
- A stack's review (`agent-review-stack.ts`): out of scope at first. A stack above the threshold reviews in one pass,
  as today. Slicing each member separately can follow.

**Costs to accept**

- A sliced review is N+2 agent runs (grouping, slices, seams), at most 1 + 8 + 1, on the user's Max usage. Each run
  is smaller, but the total is larger than one pass. The confirmation says how many runs to expect.
- It takes longer, since slices run one after another.

## Step 3: compare and set the default

- Rerun step 0's pull requests in slices. Compare with step 1's single pass: the comments kept by the user, the files
  commented, the bugs found only at seams, and the usage.
- Set the threshold's default from that, or drop slicing if step 1 is enough.

## Tests

- Core, pure: the generated-file rule, the size count, folder grouping, slices from a grouping (ownership, merging
  small groups, the cap), dropping comments outside a slice, merging drafts.
- Worker: the prompts (slice and seams) at the `buildPrompt` level; a sliced run with a fake `AgentFn`: one slice
  failing, a reused grouping, a grouping run first.
- Real Docker with ticket 9001 (`docs/architecture/testing.md`), one sliced run, with the user's consent since it uses
  Claude usage.

## Docs to update when built

- `docs/spec/pull-requests.md` (Review with agent), `docs/architecture/agents.md` (the review side runs).
- `documentation/reviewing.md`: **Review with agent** on a large change, the In slices / In one pass choice, the
  slices on the card, the setting.

## Decisions to make

- Default threshold: 1200 lines, or set from step 3's figures only?
- Seam pass model: the review agent's (Opus by default), or Sonnet, since it reads findings more than code?
- Should the slice agents be allowed to build and run tests, like today's review, or only read, to keep each run
  short?
