# Follow a base branch that was merged

Status: built (2026-10-23, branch `follow-merged-base`); decisions D1 to D6 confirmed. Spec in
[`docs/spec/rebase.md`](../spec/rebase.md#base-moved-on-github). Built as planned, except: the left base is read
from its merged PR's pull ref first, its branch only without one (what was merged is what to leave behind); a
rebase that finds no trace of the left base still clears `left_base` (event `left_base_dropped`); R2 is handled by
the executor fetching the new base before any step of a followed ticket that lacks it (`followed-base-ref.ts`).
R1 checked on Senova: the App token fetches `refs/pull/1629/head` after the branch was deleted. No Log line of its
own for `base_followed`: the PR tab's notice shows it, with its own Rebase button when the branch is up to date
with the new base (the behind count then offers none). Not tried yet on a ticket whose base merged.

## Why

A ticket built on another branch (a parent ticket's, or one chosen in Overview) keeps that branch as its base
(`tickets.base_branch`) until a [change of target](../spec/retarget.md). When that base's own pull request merges and
GitHub deletes the branch (`delete_branch_on_merge`, on for Senova), GitHub moves the ticket's PR onto the base's
target by itself. Union does not notice:

- **Rebase** fails at the fetch: `fatal: couldn't find remote ref refs/heads/<old base>`.
- **Change target** onto the branch GitHub already chose fails too: the PR already targets it, so the move falls back
  to the ticket's base (`leftBase`) as the branch it leaves, and that branch is gone ("no longer exist on GitHub").
- The review diff, the Overview and later steps still use the deleted branch.

Seen on ticket 18 (2026-10-23): base `conception/14/tax-notice-14-social-survey-grid`, merged into `senova-dev` by
#1629 and deleted, PR #1643 retargeted by GitHub. Fixed by hand: the ticket's base set to `senova-dev` in the
database, then a plain Rebase (clean, since #1629 was a merge commit). With a squash merge the same rebase would
replay the old base's commits and stop on conflicts.

## Design in short

- **Notice it in the poll.** `refreshPullRequest` already reads the PR's base from GitHub (`PullRequestStatus.base`).
  When an open PR's base differs from `tickets.base_branch`, the worker takes GitHub's: `base_branch` and
  `chosen_base_branch` become the new base, and the branch it left is kept in a new column `tickets.left_base`
  (`{ branch, prNumber }`: the old base and its merged PR, when there is one). Event `base_followed
  { from, to, prNumber, reason }`. Only the database is written; nothing goes to GitHub.
- **The PR tab says so**: "`<old>` was merged into `<new>` (#1629); this pull request now targets `<new>`." The
  behind count and **Rebase** are as usual.
- **The next Rebase moves only the ticket's own commits** while `left_base` is set: it runs as the retarget's move
  (`git rebase --onto origin/<new> <fork>`, the check that none of the old base's commits came along), without the
  PR base update since GitHub already has it. Right after a merge commit this gives the same result as a plain
  rebase. After a squash merge it is the only way that works. `left_base` is cleared once pushed.
- **The fork point without the branch.** `fetchIntoContainer` gets the old base from `refs/pull/<n>/head` of its
  merged PR when `refs/heads/<old>` is gone, stored in the container as `origin/<old>`, so `forkPoint` and the
  retarget's checks work unchanged. `refs/pull/<n>/head` stays on GitHub after the branch is deleted.
- **Change target uses the same fallback**: a `from` branch that is gone but has a merged PR is fetched from its
  pull ref instead of refusing the move.

## Decisions (proposed)

- **D1. Follow GitHub, in the database only.** The worker records the new base on its own (it is what GitHub already
  shows), but never pushes or edits the PR for it.
- **D2. When to follow.** Only when no step is running (`phase.kind !== 'running'`), so a running step never sees
  its base change under it; the next poll after the step catches it. Not for a split ticket: the stack has its own
  follow-up (`stack-follow.ts`).
- **D3. Which edits count.** Any change of the PR's base on GitHub, not only GitHub's own after a merge: a user who
  edits the base on GitHub gets the same follow-up (the retarget plan's "Retargeting from GitHub", left out
  there). `reason` is `merged` when the old base has a merged PR, else `edited`. For `edited` the old branch usually
  still exists, so the fetch needs no pull ref.
- **D4. The rebase is not started automatically.** Rebasing force-pushes and may call the implementer. The PR tab
  shows the notice and the user clicks Rebase. Later, as an option: a git-only rebase started by the worker, like
  the restack after a slice merged (`hostOnly`), with a conflict left for the user.
- **D5. Finding the merged PR of the old base.** For a parent ticket, its own `pr_number`. Otherwise, a read of
  GitHub: `pulls.list({ head: '<owner>:<old>', state: 'closed' })`, the merged one. None found (the branch was
  deleted without a merge, or the base was edited): `prNumber` is null. Then a rebase falls back to the old
  base's ref left in the workspace (`origin/<old>` from the last fetch). If even that is missing, it runs a plain
  rebase and says so in the Log.
- **D6. Not covered: a merged base that was not deleted.** GitHub then leaves the PR on the old base. Change
  target already handles it (both branches exist). A notice for it ("the base `<old>` was merged into `<new>`:
  change target") is left for later.

## Core (pure, with tests)

- Migration: `tickets.left_base` (JSON, nullable). `drizzle-kit generate`, then a restart of web and worker.
- `event-payloads.ts`: `base_followed { from: string; to: string; prNumber: number | null; reason: 'merged' |
  'edited' }`.
- A pure `followedBase(ticket, prBase)` in its own file: the change to make, or null (same base, step running,
  split ticket, no PR). Tests next to it.
- No change to `states.ts`: no new phase or action.

## Worker

- `github/pull-request.ts`: after `storeStatus`, `followBase(db, api, repo, ticket, status.base)`, in a new file
  (`pull-request.ts` is near its limits): D5's lookup, the update and the event, in one transaction.
- `GitHubApi.mergedPullRequestOf(repo, branch)`: Octokit and the fake.
- `rebase-fetch.ts`: refs `{ name, pull?: number }` for the branch being left. When `refs/heads/<name>` is missing,
  fetch `refs/pull/<pull>/head` into `refs/remotes/origin/<name>`. A missing base gives a clear error ("the base
  `<b>` no longer exists on GitHub") instead of git's.
- `rebase.ts`: a ticket with `left_base` runs with `retarget: { from: left_base.branch, to: base }` (the move) and
  skips `moveOnGitHub`. Cleared with the push. Keep the change small: `rebase.ts` and `rebase-attempt.ts` are near
  their limits.
- `retarget.ts` (`prepareMove`): `missingBranches` accepts a gone `from` that has a merged PR, passed to the fetch.

## Web

- `pull-request/branch-status.tsx`: the notice while `left_base` is set (from the ticket detail; `toPublicProject`
  unchanged). The Log line for `base_followed`.
- Overview's base row shows the new base (it reads `base_branch`).

## Tests

- `followed-base.test.ts`: same base, a changed base, a running step, a split ticket.
- Poll test with the fake API: the PR's base changed → `base_branch`, `chosen_base_branch`, `left_base`, the event;
  nothing written to GitHub.
- `rebase.test.ts`, real git: a base squash-merged into `main` and deleted, with only `refs/pull/1/head` left on the
  bare remote. The Rebase moves only the ticket's commits (no agent), the remote branch has no commit of the old
  base, `left_base` is cleared. The same with a merge commit. Change target from a deleted base with a pull ref.
- UI check: the notice.
- A real ticket: none waiting now (ticket 18 was fixed by hand); try on the next child whose base merges.

## Risks to check first

- **R1.** The host can fetch `refs/pull/<n>/head` with the project's credentials (App installation token and PAT).
- **R2.** After a follow, the steps that diff against the base (final review, diff snapshot, custom steps after
  the implementation) find a local `<new>` in the container, or fetch it first.

## Not in this plan

- An automatic rebase after a follow (D4, later).
- A merged base whose branch was kept (D6).
