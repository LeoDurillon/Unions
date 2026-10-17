# Plan: split a ticket's pull request into a stack

Status: planned, not started; decisions taken, risks to revise before building (side note at the end)
(2026-10-17). Replaces the ticket groups, split and restack plans: a stack stays one ticket. Part A (split an
existing PR) first, then part B (slices declared by the plan).

## Goal

A ticket's PR turns out too big to review. Union cuts it into stacked PRs, one per part of the spec, each holding as
many commits as that part needs. For a feature with a migration, a CRUD and a page:

```
main ─ m1 ─┬─ c1 ─ c2 ─┬─ f1 ─ f2 ─ f3     the ticket's branch, 12-billing (its tip is the top slice's)
           │           │             └─ slice 3 "Frontend page"  → PR #100, the ticket's PR (base: 12-billing-s2)
           │           └─ slice 2 "CRUD" (impl, tests)           → PR #102 (base: 12-billing-s1)
           └─ slice 1 "Database migration"                       → PR #101 (base: main)
```

## Model

- One ticket, one branch, one container, one session, one card, one issue. No groups.
- A **slice** is a part of the spec and a run of consecutive commits on the ticket's branch. A slice owns the commits
  after the previous slice's tip, up to its own tip.
- New table `ticket_slices`: `ticket_id` (cascade), `position` (1 is the bottom), `title`, `spec` (the part of the
  spec it implements, text), `tip_sha`, `branch`, `pr_number`, `pr_state`, `pr_merged_at`, `merged_tip_sha` (its tip
  when it merged, for `--onto`), timestamps.
- A ticket without slices is today's ticket. A ticket with slices has at least two.
- **The top slice is the ticket's branch and PR.** Its branch stays `tickets.branch` and its PR stays
  `tickets.pr_number`; only its base changes, to the slice below. The lower slices get `<branch>-s<position>`.
  So the code reading `branch` and `pr_number` (about 45 files) keeps working, a child ticket still builds on the
  whole branch, and the existing PR keeps its discussion (its diff shrinks to the top slice).
- Commits name their slice with a `Slice: <position>` trailer. The host checks that order, never trusts it alone.

## Part A: split an existing PR

### Plan the slices

**Split into a stack** in the PR tab, while the PR is open, at the final review or once Done (the same place as
Simplify history). A read-only agent (new prompt `split_plan` in Agent settings, the final review's model) gets the
spec (ticket text, or the specs picked as for Group by spec), the diff and the commits, and proposes the slices: title,
spec part, which files and hunks go where, and why the order holds (each slice must build and pass its tests on the
one below). The output is a step tab like the plans: the user edits it, approves or asks for a revision. A ticket
already split can be split again (its slices are replaced when the new build is pushed).

### Build

The implementer's session, resumed with the `split` prompt and the approved slices: rewrite the history into one or
more commits per slice, in order, each with its `Slice:` trailer. Same tools, fetch and hook handling as Simplify
history (`simplify*.ts`, shared rather than copied). The host checks:

- no rebase left, still on the branch, nothing uncommitted, the same fork point;
- the same tree at the end (`HEAD^{tree}`): the code did not change;
- every slice has at least one commit, trailers are present and never go back (1, 1, 2, 3, 3, 3);
- optionally (project setting, off by default) the project's checks on each slice tip; a failure goes back to the
  agent with bounded attempts.

Any failure puts the branch back as it was, unpushed, as Simplify history does.

### Publish

- Local branches `<branch>-s<n>` at each lower tip in the container; the host force-pushes all of them with leases.
- The worker opens a draft PR per lower slice (base: the slice below), then changes the ticket's PR base to the
  slice under the top. New GitHub call: `updatePullRequestBase` (`pulls.update` with `base`).
- PR descriptions: the slice's title and spec part, the stack as a list (`#101 → #102 → #100`, this one marked), and
  `Part of #12`. GitHub only honours `Closes #12` on a PR into the default branch, so no slice says it; Union closes
  the issue itself (see Merge).
- Ready for review: approving the final review marks every slice's PR ready, as it does the single PR today.
- One comment on the issue: "Split into a stack: #101 Database migration → #102 CRUD → #100 Frontend page".

## Review

- The ticket's review page gets the stack picker built for PR reviews (`stack-tabs.tsx`), shown only when the
  ticket has slices: one segment per slice, its diff `tip(n-1)...tip(n)` (the first one's from the base), with each
  commit's own diff as today.
- Comments are stored with their slice, and the implementer's prompt says which slice each belongs to.
- "Review with agent" on a split ticket offers the stack run built for PRs: each slice's spec part linked to its slice.
  Its members are PR review rows today; the ticket version needs members as slices (step 4).

## Revise, rebase, merge

### Revise

The implementer gets the slices (title, spec part, commits) and adds commits on top, each saying where it belongs:

- `Slice: 2`: a new commit at the end of slice 2 (a missing test);
- `fixup! <subject>`: folded into that commit (a bug in the CRUD).

Then the host restacks without an agent: `git rebase -i --autosquash --update-refs` onto the same base, with a todo
it writes (`GIT_SEQUENCE_EDITOR`), moving each `Slice:` commit after its slice's last commit. `--update-refs` moves the
local slice branches with the commits (git 2.38+; the agent image's bookworm has 2.39). A commit without a
target: the host asks the session which slice, as it asks a message for left changes. A conflict while reordering:
the branch is reset and the implementer resolves it with the rebase prompt. Then the same tree check (reordering must
not change the final code), then every changed slice branch is force-pushed with a lease.

### Rebase onto the base

Today's Rebase (host first, agent on conflict) with `--update-refs`, so every slice branch follows; then all slices
are pushed. `behind_by` stays the ticket's (the bottom slice is the one behind the base).

### Merge

The user merges from the bottom on GitHub. The PR poll (`pull-request.ts`) reads every slice's PR state. When the
bottom one merges:

1. Its row records `merged_tip_sha`; the ticket's base for the rest is still the project's base.
2. The host moves the remaining commits: `git rebase --onto origin/<base> <merged tip> --update-refs` (works after a
   squash or rebase merge, where the merged commits are not in the base as they were). Conflicts: the rebase agent.
3. The next slice's PR is retargeted to the base, unless GitHub already did it (it does when the merged branch is
   deleted). Its branch and the others are pushed.

Automatic after a merge or behind a **Restack** button: button in v1, it force-pushes and retargets. The PR tab says
"#101 merged: restack the 2 others".

The ticket is Merged when every slice is merged: `tickets.pr_state` (the top PR's) is that, since the top merges last.
A closed slice without a merge stops the stack: the PR tab says so; Restack offers to fold its commits into the next
slice or to drop them (a code change: the final review runs again).

## Board, GitHub, events

- The card shows "Stack of 3 · 1 merged" and the slices' PR numbers. Columns are unchanged: In review until the top
  PR merges.
- Union closes the issue when the last slice merges (it had no `Closes`).
- Event rules fire per ticket, as today: "PR merged" when the ticket's PR (the top one) merges, which is when the
  whole stack is. `{pr.url}` is the ticket's PR. A per-slice trigger is not needed in v1.

## State machine

New actions, pure and tested in `states.test.ts`, from `awaiting_approval` on `final_review` and from `done` (with
`thenDone`):

- `split`: `running` on `split_plan` → `awaiting_approval` on `split_plan` → approve → `running` on `split` →
  back to where it started (the final review stands: the code is the same). Revising the plan reruns `split_plan`.
- `restack`: `running` on `restack` → back, or `final_review` when an agent changed code (as in the rebase).

`split_plan`, `split` and `restack` are `Step`s, not pipeline steps; the board shows them as In review.

## Part B: slices declared by the plan

When the ticket is known to be big from the start:

- The planning step may declare slices (a section of the plan, same fields as `split_plan`'s output); the user edits
  them with the plan. A flow option "Plan slices" turns it on per ticket.
- The implementer works slice by slice and tags each commit. The host runs the same checks as after a split, so a
  slice without commits or out of order fails the step with a revision.
- Publish opens the stack at the end of implementation, as part A does. Publishing each slice as soon as it is done
  is a later option.
- A plan that guessed wrong is split again with part A.

## Delivery

Each step passes `bun run check`; steps 1 to 3 and 5 touch core and the worker: run `bun run active` before editing.

1. **Core:** `ticket_slices` and its migration, the pure rules (slice order from trailers, the restack todo, the PR
   description of a slice, stack state "n merged"), the new actions in `states.ts`, tests.
2. **Split:** `split_plan` and `split` (shared with Simplify history), the host checks, publish (branches, PRs,
   retarget, issue comment), the PR tab action and the plan tab.
3. **Revise and rebase:** trailers in the implementer's prompt, restack after a revision, `--update-refs` in the
   rebase, pushing every slice.
4. **Review page:** the stack picker on the ticket's review, comments per slice, the agent stack review on slices.
5. **Merge:** per-slice PR polling, Restack after a merge, retarget, closing the issue, the card.
6. **Part B:** slices in the plan, the implementer's prompt, publish at the end of implementation.
7. `SPEC.md`, `docs/architecture/worker.md`, maps.

A real split costs the user's Claude usage and pushes to a real repository: ask before running one; try it first on a
ticket of a test repository.

## Decisions

Taken (2026-10-17):

1. A stack is one ticket; no ticket groups.
2. Slices follow the spec, with any number of commits each; branch names are the program's concern.
3. Part A (split after the fact) first, then part B (slices from the plan).
4. The existing PR becomes the top slice: it keeps its discussion and every `pr_number` reader.
5. Checks on each slice tip: a project setting, off by default.
6. Restack after a merge is a button in v1; automatic later.
7. A closed (unmerged) slice: Restack offers to fold its commits into the next slice or to drop them.

## Side note: risks to revise before building

Found after the plan was written (2026-10-17). The plan above is unchanged; each point needs a decision before the
step it touches.

1. **Out-of-order merge.** The plan assumes the top PR merges last. If it is merged first, it lands on the slice
   below, not the base, yet `tickets.pr_state` reads merged: the card goes to Merged, the issue closes and "PR
   merged" rules fire (Notion Done) with nothing in `main`. Possible fix: a ticket is merged only when every slice is
   merged into the project's base (from `ticket_slices`); a slice merged into another slice's branch is an error.
2. **Readers of the PR's base.** With the top slice as the ticket's PR, its base is the slice below: `behind_by`
   (`compare/<PR base>...<head>`) reads 0 and hides Rebase, CI checks show the top slice only, while the review diff
   (`base...HEAD`) shows the whole stack. Possible fix: list every reader of the PR's base and state in step 1 and
   make each use the bottom slice or the whole stack on purpose.
3. **Slices that do not stand alone.** The tree check proves only the final code; slice 2 can rely on a type added
   in slice 3, and with per-slice checks off by default a broken slice 1 can merge into `main`. Possible fix (reverses
   decision 5): checks on every slice tip for the split, on by default; optional for restacks after a revision.
4. **Partial features in `main`.** Merging the bottom first can ship a CRUD with no page. Possible fix: the
   `split_plan` prompt requires each slice to be safe to ship alone (a feature flag if needed) and says how.
5. **Half-pushed stack.** Pushing slice branches one by one can stop at a rejected lease. Possible fix: one
   `git push --atomic` with a `--force-with-lease` per branch.
6. **Pushes from outside Union.** Today only the ticket's branch is checked for commits the workspace lacks; someone
   can push to `<branch>-s1`. Possible fix: the same check on every slice branch.
7. **Squash merge with branch deletion.** GitHub retargets the next PR to the base, but it still holds the merged
   slice's original commits: until Restack, its diff repeats them and merging it conflicts or duplicates them.
   Possible fix: restack automatically after a merge when it is clean (reverses decision 6), or warn on the PR.
8. **Fixups on the wrong commit.** `fixup! <subject>` matches messages, which can repeat ("Add tests"). Possible fix:
   `fixup! <sha>`, refusing unknown or ambiguous targets.
9. **Reviews reset above a revision.** A fix in slice 1 rewrites slices 2 and 3: their GitHub threads go outdated
   and reviewers see a force-push. Inherent to stacks; the PR tab should say which slices a revision touched.
10. **Usage.** A split is two agent runs on the largest diffs, more with per-slice checks and retries. Try it first on
    a medium PR.
11. **Child tickets.** A child builds on the ticket's branch, which every restack rewrites: the existing rebase
    problem, more often.
12. **Size.** Three new steps and GitHub state to keep in sync with `ticket_slices`. Part A is only safe to use on
    a real repository once steps 1 to 5 are all built (a split without merge handling is risky).
