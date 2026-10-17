# Plan: stacked pull requests in the Pull requests and Current reviews tabs

Status: built, steps 1 to 4 (branch `stacked-pr-reviews`, last commit `03e3dbf`), and v1 items 2 and 3 of "Not
built yet" (2026-10-17). The size warning (item 1) is left. Steps 1 to 3 are web only; step 4 added two migrations (`0050`, `0051`) and worker
changes.

## Idea

A stack of pull requests (each one targets the branch of the one below) shows as one item in the Pull requests and
Current reviews tabs. Opening it opens one review page where a segmented control picks the pull request: the user
reviews them one at a time, in order, without going back to the list. The agent can review the whole stack in one
run, against several specs linked to its pull requests.

## What Union already has

- The Pull requests tab lists the newest 100 pull requests of the repository with `headBranch` and `baseBranch`
  (`github-pull-requests.ts`).
- `current_reviews` keeps one row per pull request under review, with its branches as they were when it was added,
  its files, its drafts and its posting status. Its diff is GitHub's: against the PR's base, so a stacked PR's diff is
  already only its own change.
- `pr-review.ts` reads the PR's files again when the diff opens; GitHub's answer carries the current `baseBranch`.

## Detecting a stack

PR B sits on PR A when `B.baseBranch === A.headBranch`. A pure function in core, used by the client on both tabs:

```ts
// packages/core/src/pr-stacks.ts
export function pullRequestStacks<T extends StackMember>(pulls: T[]): T[][];
```

- Each stack is ordered bottom first. The bottom is the PR whose base is no other listed PR's head.
- A PR with two children: both follow it, one after the other (a flat order is enough for tabs; such forks are rare).
- A PR on its own is a stack of one: it shows as today.
- A fork's head branch is no base for anything: a branch of the repository can share its name. A fork's PR can still
  sit on one of ours. `isCrossRepository` comes with `REPOSITORY_PULL_REQUESTS`, as `crossRepository` on
  `PullRequestListItem`.
- Only open PRs are grouped. Tested in `pr-stacks.test.ts`: chain, two PRs on one, branches in a ring, forks.

## Pull requests tab

- Stacks come first, under a "Stacks" heading, then a gap and the other pull requests under "Pull requests".
- A stack of two or more is one row: "Stack of 3 · #12 Add schema", with its members indented below in order
  (`#13 → #12`, `#14 → #13`), each with its state, review badge and size.
- Each member keeps its own action: Open ticket when linked.
- The stack row offers **Add stack to reviews**: adds every member without a ticket, in one request
  (`POST /reviews/stack` takes the list), so a stack is never half added. Members already in reviews are skipped, not
  refused (the single add answers 409 for them); when some are in, the button says how many it adds: "Add 1 to
  reviews".
- A PR whose base is the head of a PR already in reviews joins that stack through the usual Add to reviews: no
  separate action. Its row says so: "joins the stack of #12".
- Under Closed and All the list stays flat (merged members break the chain).
- Limit: a member outside the newest 100 is missing, and the stack looks shorter.

## Current reviews tab

- Rows are grouped with the same function, on the stored branches: one row per stack, "Stack of 3", with the posting
  badge of any member.
- **Open review** opens the stack on its bottom PR. **Remove** removes the whole stack.
- Only PRs without a ticket are here (linked ones are reviewed from their ticket, whose drafts go to the
  implementer, not to GitHub). A linked PR in the middle of a stack therefore splits it: with #13 linked, #12 and #14
  show as two stacks. Accepted in v1; the Pull requests tab still shows the whole stack.
- The stored branches go stale when GitHub retargets a PR (it does when the base branch is deleted after a merge):
  `pr-review.ts` writes `baseBranch` and `headBranch` back each time it reads the files, so the stack shrinks after a
  merge.

## Review page

```
← Back   Review: #13 API                  Group by spec  Review with agent  [Unified|Split]  Post on GitHub
 Stack of 3   [ #12 2 | #13 | #14 1 failed ]          ← segmented control, bottom first: draft count, posting state
 Description | Comments | Diff                        ← today's tabs, for the picked PR
```

- `stack-tabs.tsx` under the header: the stack's PRs as a segmented control (the same `Segmented` as the
  discussion's All / People / Bots filter), the title on hover; it wraps on a long stack. The header names the
  picked PR. (The first design had one tab per PR with its title; built as above instead.)
- `<ReviewPage key={number} …>`: switching PRs resets the section tab and the open file.
- Diffs, comments and posting do not change: each PR is its own review row with its own drafts.
- **Post on GitHub** posts the picked PR's review only. The banner and `posting` follow the picked PR.
- Draft counts come from each PR's comments query (`useDraftCounts`, sharing `useComments`' cache).
- A stack of one shows no PR picker: the page is today's.

## Review with agent: several specs, the whole stack

### Today

- **Review with agent** (`agent_reviews`, worker `agent-review.ts`) takes no specification. A ticket's run gets the
  ticket's title and text; a pull request's run gets only its number, branches and title (`agent-review-target.ts`),
  not its description.
- **Group by spec** takes one specification, picked in `group-by-spec-dialog.tsx` from `spec-sources.ts`: the PR
  description, the ticket's text, a GitHub issue or a Notion page, editable before the agent reads it.
- One run covers one change, and its findings become drafts on that change only.

### What changes

1. **Specs for any agent review.** Review with agent opens a dialog first (not only for stacks): a list of specs,
   each added from the same sources as Group by spec and editable the same way. It starts with today's input: the
   ticket's text for a ticket, the PR description for a pull request (new: today the agent sees only the title).
   Zero specs is allowed: the agent then reviews the code alone.
2. **Specs linked to PRs of the stack.** In a stack, each spec has a box per PR: which PRs implement it. Defaults:
   each PR's description is added and linked to its own PR; an issue or Notion page added by the user is linked to
   every PR until unticked. A PR may have no spec.
3. **One run for the whole stack.** "Review the stack with agent" queues one run that reads every PR, so it sees what
   no single PR shows: a slice that breaks what the one below adds, a spec part no slice implements, work done twice.
   "Review this PR with agent" stays, with the same dialog and only that PR's box.

### Model (core, one migration)

- `agent_reviews.specs`: JSON, `{ kind, label, text, prs: number[] }[]` as the user sent them: the prompt can be
  rebuilt, and the dialog opens on the last run's specs. `prs` is empty for a ticket or a single PR.
- `agent_review_members` (`agent_review_id`, `review_id`, cascades with both): the reviews a stack run covers.
  `agent_reviews.review_id` stays the bottom PR's, so today's queries keep working for single runs.
- `latestAgentReview` and the busy check look at members too: a stack run shows on every tab of the stack, and a
  single run on a member is refused while the stack run is queued or running (and the other way round).
- Shared spec types and the prompt's spec section in core (`agent-review-specs.ts`, pure, tested).

### Web

- `POST <review>/agent-review` accepts `{ specs, stack?: number[] }`. Specs are read with `readSpec` when added in
  the dialog (as Group by spec does), and the edited text is what is sent.
- For a stack, the route reads every member's files again (the same read as `pr-review.ts`), so every member has
  its current `headSha` and patches before the worker starts. A member merged or closed on GitHub is refused by
  number (409), as is one no longer under review.
- `group-by-spec-dialog.tsx`'s source picker and spec editor move to a shared `spec-picker.tsx`; the new
  `agent-review-dialog.tsx` lists specs with their PR boxes. Group by spec keeps one spec in v1.

### Worker

- **Checkout:** `clonePullRequest` gains a stack form: clone the bottom PR's base, fetch `pull/<n>/head` of each
  member into `refs/union/pr-<n>` at the `headSha` its files were read at, check out the top one. A member that moved
  fails the run with its number, as today.
- **Prompt:** the members bottom first, each with its title, branches, the command for its own change
  (`git diff <its base ref>...refs/union/pr-<n>`) and the specs linked to it; then each spec's text once, numbered.
  The agent is asked to review each PR against its specs, then the stack as a whole.
- **Findings:** each comment gains `"pr": <n>` (asked for in a stack run, not enforced). They are split per PR and turned into drafts
  with that PR's `patchOf`, as `toDrafts` does now; a comment on a line outside its PR's diff becomes a general
  comment of that PR. A comment without `pr`, or whose `pr` is not in the stack, goes to the top PR as a general
  comment that starts with "Not tied to a pull request" (and the number the agent gave, if any). The summary goes to the top PR. `MAX_COMMENTS` applies per PR.
- **Finish:** `finishAgentReview` replaces the agent's unkept drafts of each member, in one transaction.

### Limits

- One run reads every member's diff: a big stack is slow and uses a lot of the user's usage. The dialog should show
  the stack's total size and, above a threshold (about 3,000 changed lines), suggest reviewing PR by PR: not built
  yet, see below.
- Specs are copied into the prompt whole: a long Notion page is trimmed in the dialog by the user, as for Group by
  spec.

## Delivery

Built on branch `stacked-pr-reviews`, each commit passing `bun run check`:

1. `f5ff20e`: `pr-stacks.ts` and its tests, `isCrossRepository` in the query and list type, branches written back
   in `pr-review.ts`.
2. `7ff2a84`: Pull requests tab: stacks first, the stack row (closed until opened), Add stack to reviews,
   `POST /reviews/stack`.
3. `d00ee0c`: Current reviews tab: stack rows, Remove stack in one transaction (`POST /reviews/stack/remove`); the
   review page's PR picker.
4. `03e3dbf`: Review with agent: specs for any agent review, the stack run (members, stack checkout, findings per
   PR), the PR picker as a segmented control. One commit: the two halves touch the same files.

## Not built yet

Promised for v1, to do before merging:

1. **Size warning in the dialog.** Current reviews do not keep their size: store additions and deletions when a PR
   is added or its files are read (a migration), then show the stack's total and suggest PR by PR above about
   3,000 changed lines.
2. **A member no longer open.** Built (2026-10-17): the stack start reads every member's files again, the state
   with them, and refuses those merged or closed by number.
3. **`"pr"` required in a stack run.** Built (2026-10-17), with the fallback kept: a comment without `pr`, or with
   one not in the stack, goes to the top PR as a general comment prefixed "Not tied to a pull request".

Known limit, not planned:

- Current reviews do not store whether a PR comes from a fork: a fork's PR whose branch name is one of ours can be
  grouped into a stack it is not in. Fixing it takes a `cross_repository` column filled when the PR is added.

Not tested:

- A real agent run on a real stack (it uses the user's Claude usage). Only a faked agent went through the stack
  prompt: how reliably the agent tags each comment with its PR is unknown. Try a stack of two or three first.

## Not in v1

- **Post all**: one posting per PR with drafts, from the stack.
- Ticket stacks (tickets with a parent) as tabs on the ticket review page, through `parentTicketId`: belongs with
  [splitting a PR into a stack](pr-stack.md) (a split ticket's slices).
- Restacking: [splitting a PR into a stack](pr-stack.md).

## Decisions

1. **Remove** acts on the whole stack in v1, in one transaction. A merged bottom PR leaves on its own: GitHub
   retargets the next one and the stored branches follow. Removing one PR (from the review page's picker) can come
   later: the route exists.
2. **Ticket-linked PRs** stay out of Current reviews, even in a stack: one review page, one way to send. A linked PR
   in the middle splits the stack there (see Current reviews tab).
3. **A new PR on top** of a stack under review needs no "Add to this stack": the grouping follows the branches, so
   the usual Add puts it in the stack; its row says which stack it joins.

## Step 4 questions (answered as recommended)

1. Several specs for Group by spec too? Later (not built). Its groups are parts of one spec; with several, each
   part needs its spec's name, and the panel gets longer. The shared picker makes it easy afterwards.
2. Ticket stacks (tickets with a parent): same stack run? Not in v1, like the PR picker. Their checkout is the
   ticket containers, not throwaway clones.
3. A stack run while some members already have the user's own drafts: kept (as before: a run only replaces the
   agent's drafts the user did not keep).
