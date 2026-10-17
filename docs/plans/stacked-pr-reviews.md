# Plan: stacked pull requests in the Pull requests and Current reviews tabs

Status: planned, decisions made, not started. Steps 1 to 3 are web only (no worker change, no migration); step 4,
reviewing the stack with the agent, needs a migration and worker changes.

## Idea

A stack of pull requests (each one targets the branch of the one below) shows as one item in the Pull requests and
Current reviews tabs. Opening it opens one review page with a tab per pull request: the user reviews them one at a
time, in order, without going back to the list.

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

- A stack of two or more is one row: "Stack of 3 · #12 Add schema", with its members indented below in order
  (`#13 → #12`, `#14 → #13`), each with its state, review badge and size.
- Each member keeps its own action: Open ticket when linked.
- The stack row offers **Add stack to reviews**: adds every member without a ticket, in one request
  (`POST /reviews` accepts a list), so a stack is never half added. Members already in reviews are skipped, not
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
← Back   Stack: Add schema → API → UI                [Unified|Split]  Post on GitHub
 [#12 Add schema (2)]  [#13 API]  [#14 UI (1)]        ← one tab per PR, its draft count
 Description | Comments | Diff                        ← today's tabs, for the picked PR
```

- A new `review/stack-tabs.tsx` above `ReviewPage`; the picked PR sets `target`.
- `<ReviewPage key={number} …>`: switching PRs resets the section tab and the open file.
- Diffs, comments and posting do not change: each PR is its own review row with its own drafts.
- **Post on GitHub** posts the picked PR's review only. The banner and `posting` follow the picked PR.
- Draft counts come from each PR's comments query (`useComments`, cached per target).
- A stack of one shows no PR tabs: the page is today's.

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
- For a stack, the route reads the files of members whose diff was never opened (the same read as `pr-review.ts`),
  so every member has its `headSha` and patches before the worker starts. A member that is not open any more is
  refused by name.
- `group-by-spec-dialog.tsx`'s source picker and spec editor move to a shared `spec-picker.tsx`; the new
  `agent-review-dialog.tsx` lists specs with their PR boxes. Group by spec keeps one spec in v1.

### Worker

- **Checkout:** `clonePullRequest` gains a stack form: clone the bottom PR's base, fetch `pull/<n>/head` of each
  member into `refs/union/pr-<n>` at the `headSha` its files were read at, check out the top one. A member that moved
  fails the run with its number, as today.
- **Prompt:** the members bottom first, each with its title, branches, the command for its own change
  (`git diff <its base ref>...refs/union/pr-<n>`) and the specs linked to it; then each spec's text once, numbered.
  The agent is asked to review each PR against its specs, then the stack as a whole.
- **Findings:** each comment gains `"pr": <n>` (required in a stack run). They are split per PR and turned into drafts
  with that PR's `patchOf`, as `toDrafts` does now; a comment on a line outside its PR's diff becomes a general
  comment of that PR. A comment whose `pr` is not in the stack goes to the top PR as a general comment, with the
  number the agent gave. The summary goes to the top PR. `MAX_COMMENTS` applies per PR.
- **Finish:** `finishAgentReview` replaces the agent's unkept drafts of each member, in one transaction.

### Limits

- One run reads every member's diff: a big stack is slow and uses a lot of the user's usage. The dialog shows the
  stack's total size; above a threshold (to pick when building, about 3,000 changed lines), it suggests reviewing PR
  by PR.
- Specs are copied into the prompt whole: a long Notion page is trimmed in the dialog by the user, as for Group by
  spec.

## Delivery

Four commits, each passing `bun run check`:

1. `pr-stacks.ts` and its tests, `isCrossRepository` in the query and list type, branches written back in
   `pr-review.ts`.
2. Pull requests tab: the stack row, Add stack to reviews, the list form of `POST /reviews`.
3. Current reviews tab: stack rows; review page: `stack-tabs.tsx`. Update `docs/architecture/web.md`.
4. Review with agent: specs for any agent review (migration, dialog, prompt), then the stack run (members, stack
   checkout, findings per PR). Update `docs/architecture/web.md` and `worker.md`. Can be split in two: specs first,
   stack run second.

## Not in v1

- **Post all**: one posting per PR with drafts, from the stack.
- Ticket stacks (tickets with a parent) as tabs on the ticket review page, through `parentTicketId`: belongs with
  [ticket groups](ticket-groups.md) and [splitting a PR into a stack](pr-stack-split.md).
- Restacking: [restack](restack.md).

## Decisions

1. **Remove** acts on the whole stack in v1. A merged bottom PR leaves on its own: GitHub retargets the next one and
   the stored branches follow. Removing one PR (from its tab on the review page) can come later: the route exists.
2. **Ticket-linked PRs** stay out of Current reviews, even in a stack: one review page, one way to send. A linked PR
   in the middle splits the stack there (see Current reviews tab).
3. **A new PR on top** of a stack under review needs no "Add to this stack": the grouping follows the branches, so
   the usual Add puts it in the stack; its row says which stack it joins.

## Open questions for step 4 (with recommendations)

1. Several specs for Group by spec too? Recommended: later. Its groups are parts of one spec; with several, each
   part needs its spec's name, and the panel gets longer. The shared picker makes it easy afterwards.
2. Ticket stacks (tickets with a parent): same stack run? Recommended: not in v1, like the tabs. Their checkout is the
   ticket containers, not throwaway clones.
3. A stack run while some members already have the user's own drafts: keep them (recommended, as today: a run only
   replaces the agent's drafts the user did not keep).
