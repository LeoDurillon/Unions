# Plan: split a ticket's pull request into a stack

Status: steps 1 to 5 built (branch `pr-stack`, 2026-10-20): the table, the pure rules, the state machine, the
split plan and the split, revise and rebase, the review page, merge, and the spec (`docs/spec/pr-stacks.md`);
step 6 (part B, slices declared by the plan) left. Where the build differs from
the plan: a conflict while moving a revision's commits fails the step (the implementer does not resolve it
yet, since built); Simplify history was refused on a split ticket (since built: slice by slice, 2026-10-23); on the review page the slices are entries of the commit
picker (read only, like a commit), comments stay on the whole stack's diff and the feedback names the slices
that change each commented file, and the agent review gets each slice's range and part of the spec in its
prompt (one run on the ticket, not the PR reviews' stack run); a slice closed without a merge is shown in the
PR tab but Restack does not offer to fold or drop its commits yet. Split into a stack shows only on projects that turn on "Split pull
requests into stacks" (Pull requests settings, off by default), until steps 1 to 5 are built. Decisions taken (2026-10-17), the risks found after resolved with their suggested fixes (2026-10-20,
see "Risks and how the plan handles them"). Replaces the ticket groups, split and restack plans: a stack stays one ticket. Part A (split an
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
one below). Each slice must also be safe to ship alone, since the bottom merges first: the prompt asks how (a part
that is not reachable yet, or a feature flag) and the plan says it per slice. The output is a step tab like the plans: the user edits it, approves or asks for a revision. A ticket
already split can be split again (its slices are replaced when the new build is pushed).

### Build

The implementer's session, resumed with the `split` prompt and the approved slices: rewrite the history into one or
more commits per slice, in order, each with its `Slice:` trailer. Same tools, fetch and hook handling as Simplify
history (`simplify*.ts`, shared rather than copied). The host checks:

- no rebase left, still on the branch, nothing uncommitted, the same fork point;
- the same tree at the end (`HEAD^{tree}`): the code did not change;
- every slice has at least one commit, trailers are present and never go back (1, 1, 2, 3, 3, 3);
- the project's checks on each slice tip (project setting, on by default for a split); a failure goes back to the
  agent with bounded attempts. The tree check only proves the final code: without this, slice 2 can use a type
  that slice 3 adds.

Any failure puts the branch back as it was, unpushed, as Simplify history does.

### Publish

- Local branches `<branch>-s<n>` at each lower tip in the container; the host pushes all of them in one
  `git push --atomic` with a `--force-with-lease` per branch, so a rejected lease pushes none. Every push of the
  stack (split, revise, rebase, restack) goes this way.
- Before any push, the check for commits the workspace lacks (today on the ticket's branch) runs on every slice
  branch: someone may have pushed to `<branch>-s1`.
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
- `fixup! <sha>`: folded into that commit (a bug in the CRUD). A sha, not a subject, since subjects repeat
  ("Add tests"); an unknown or ambiguous target goes back to the session.

Then the host restacks without an agent: `git rebase -i --autosquash --update-refs` onto the same base, with a todo
it writes (`GIT_SEQUENCE_EDITOR`), moving each `Slice:` commit after its slice's last commit. `--update-refs` moves the
local slice branches with the commits (git 2.38+; the agent image's bookworm has 2.39). A commit without a
target: the host asks the session which slice, as it asks a message for left changes. A conflict while reordering:
the implementer's session resolves it and the host continues the replay (built 2026-10-23). Then the same tree check (reordering must
not change the final code), then every changed slice branch is pushed (atomic, with leases). A fix in slice 1
rewrites the slices above it, whose GitHub threads go outdated: the PR tab and the issue comment for the revision
say which slices it changed and which were only moved.

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

Automatic after a merge when the host rebase is clean: a squash merge with its branch deleted leaves the next PR on
the base with the merged slice's old commits, so its diff repeats them until it is restacked. On a conflict the
stack waits behind a **Restack** button (it runs the rebase agent), and the PR tab says "#101 merged: restack the 2
others".

The ticket is Merged when every slice is merged **into the project's base**, read from `ticket_slices`, not from
`tickets.pr_state` alone. A slice merged into another slice's branch (the top PR merged first, say) is an error: the
PR tab says so, the card does not move to Merged, the issue stays open and "PR merged" rules do not fire. The fix is
the user's on GitHub (revert, or merge the rest); Union does not try.
A closed slice without a merge stops the stack: the PR tab says so; Restack offers to fold its commits into the next
slice or to drop them (a code change: the final review runs again).

## Board, GitHub, events

- The card shows "Stack of 3 · 1 merged" and the slices' PR numbers. Columns are unchanged: In review until the top
  PR merges.
- Union closes the issue when the last slice merges (it had no `Closes`).
- Event rules fire per ticket, as today: "PR merged" when the whole stack is merged into the base (see Merge). `{pr.url}` is the ticket's PR. A per-slice trigger is not needed in v1.

## Readers of the PR's base

The top PR's base becomes the slice below, so every reader of a ticket's PR base or diff says on purpose which
base it means. Step 1 lists them in code (a helper per meaning) and each uses one:

| Reader                                                                     | Today              | With slices                                                                           |
| -------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `behind_by` (`octokit-api.ts`, `compare/<PR base>...<head>`), shows Rebase | the PR's base      | the project's base against the **bottom** slice's tip; the top PR's compare reads 0   |
| CI checks (`github-checks.ts`, `routes/pr-checks.ts`)                      | the PR's head      | **per slice**, in the stack picker; the card and the gate count failures on any slice |
| Review diff, Group by spec, Explain, agent review (`ticketBase...HEAD`)    | the whole branch   | the **whole stack** by default, one slice with the picker                             |
| PR description (`pr-description.ts`)                                       | `base...HEAD`      | **per slice**, `tip(n-1)...tip(n)`                                                    |
| Rebase (`rebase-host.ts`, `rebase-git.ts`)                                 | `origin/<base>`    | the project's base, with `--update-refs` (the whole stack)                            |
| Merged state, issue closing, "PR merged" rules                             | `tickets.pr_state` | **every slice** merged into the base                                                  |

A reader not in this table that uses `ticketBase` already means the whole stack and needs no change.

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

1. **Core:** `ticket_slices` and its migration, the pure rules (slice order from trailers, `fixup! <sha>` targets,
   the restack todo, the PR description of a slice, stack state "n merged" and "merged into the base"), a helper
   per base meaning (see "Readers of the PR's base"), the new actions in `states.ts`, tests.
2. **Split:** `split_plan` and `split` (shared with Simplify history), the host checks, publish (branches, PRs,
   retarget, issue comment), the PR tab action and the plan tab.
3. **Revise and rebase:** trailers in the implementer's prompt, restack after a revision, `--update-refs` in the
   rebase, pushing every slice.
4. **Review page:** the stack picker on the ticket's review, comments per slice, the agent stack review on slices.
5. **Merge:** per-slice PR polling, Restack after a merge, retarget, closing the issue, the card.
6. **Part B:** slices in the plan, the implementer's prompt, publish at the end of implementation.
7. `SPEC.md`, `docs/architecture/worker.md`, maps.

A real split costs the user's Claude usage and pushes to a real repository: ask before running one; try it first on a
ticket of a test repository, with a medium PR (a split is two agent runs on the largest diffs, more with per-slice
checks and retries). **Split into a stack** stays hidden until steps 1 to 5 are built: a split without merge
handling is not safe on a real repository.

## GitHub's own stacks

GitHub has stacked pull requests (generally available on github.com since 2026-10-06; not on GitHub Enterprise
Server yet): a stack map on each pull request, review layer by layer, merges only from the bottom (merging a
pull request in the middle lands every one below it), and a Rebase stack button. REST API (`X-GitHub-Api-Version:
2026-03-10`): `POST /repos/{o}/{r}/stacks` (`pull_requests`, bottom first, each one's base the head of the one
below), `GET /repos/{o}/{r}/stacks?pull_request=<n>`, `POST .../stacks/{n}/add`, `POST .../stacks/{n}/unstack`;
merging a stack needs the async merge API (`PUT .../pulls/{n}/merge-async`).

Tried on LeoDurillon/Schems (2026-10-20), with the project's classic token: two stacked pull requests, a stack
created over them (201), the bottom one squash-merged with `merge-async`. Within seconds, with no one clicking,
GitHub retargeted the top pull request onto `main` and rewrote its branch onto the squash commit, keeping only its
own commit. The merged branch was not deleted. Probe pull requests #4 (merged: its squash commit stays on `main`)
and #5 (closed), stack #6 (closed), branches deleted.

What it changes (built, 2026-10-20):

1. **Split:** after the pull requests are opened, create the GitHub stack (`POST /stacks`) and keep its number;
   a new split unstacks the old one first. A 404 (GitHub Enterprise Server) keeps today's Union-only stack.
2. **Merge:** GitHub moves the rest of the stack itself, so Union must not restack after a merge (its push would
   race GitHub's rewrite and lose the lease). Instead it follows: fetches the open slices' branches as GitHub left
   them, resets the workspace's branches to them and records the tips, with no push and no agent. Union's Restack
   stays for a stack GitHub does not manage (no GitHub stack) or cannot rebase (a conflict: GitHub shows Rebase
   stack).
3. **Polling:** one `GET /stacks?pull_request=<top>` instead of a call per pull request.
4. **Out of order:** GitHub refuses it, so it only remains for a Union-only stack.

## Decisions

Taken (2026-10-17):

1. A stack is one ticket; no ticket groups.
2. Slices follow the spec, with any number of commits each; branch names are the program's concern.
3. Part A (split after the fact) first, then part B (slices from the plan).
4. The existing PR becomes the top slice: it keeps its discussion and every `pr_number` reader.
5. Checks on each slice tip: a project setting, on by default for a split, optional for restacks after a revision
   (changed 2026-10-20, was off by default).
6. Restack after a merge is automatic when the host rebase is clean; a button only on a conflict (changed
   2026-10-20, was a button in v1).
7. A closed (unmerged) slice: Restack offers to fold its commits into the next slice or to drop them.

Taken (2026-10-20), from the risks below:

8. A ticket is merged only when every slice is merged into the project's base; a slice merged into another slice is
   an error shown in the PR tab.
9. Each reader of the PR's base uses the meaning in "Readers of the PR's base".
10. Each slice is safe to ship alone; `split_plan` says how.
11. The stack is pushed in one atomic push with a lease per branch; every slice branch is checked for outside
    pushes first.
12. Fixups name a sha.
13. The PR tab says which slices a revision changed.
14. Split into a stack stays hidden until steps 1 to 5 are built.

## Risks and how the plan handles them

Found after the plan was written (2026-10-17), resolved with their suggested fixes (2026-10-20); the plan above
includes them.

1. **Out-of-order merge** (the top PR merged first would read Merged with nothing in `main`): merged means every
   slice merged into the base (Merge, decision 8).
2. **Readers of the PR's base** (`behind_by` reads 0, CI shows the top slice only): one meaning per reader
   ("Readers of the PR's base", decision 9).
3. **Slices that do not stand alone**: checks on every slice tip, on by default for a split (Build, decision 5).
4. **Partial features in `main`**: each slice safe to ship alone, said by `split_plan` (Plan the slices, decision
   10).
5. **Half-pushed stack**: one atomic push with a lease per branch (Publish, decision 11).
6. **Pushes from outside Union**: every slice branch checked before a push (Publish, decision 11).
7. **Squash merge with branch deletion**: restack automatically when clean (Merge, decision 6).
8. **Fixups on the wrong commit**: `fixup! <sha>` (Revise, decision 12).
9. **Reviews reset above a revision**: inherent to stacks; the PR tab says which slices changed (Revise, decision
   13).
10. **Usage**: try on a medium PR of a test repository first (Delivery).
11. **Child tickets**: a child builds on the ticket's branch, which every restack rewrites. The existing rebase
    problem, more often; not changed by this plan.
12. **Size**: the action stays hidden until steps 1 to 5 are built (Delivery, decision 14).
