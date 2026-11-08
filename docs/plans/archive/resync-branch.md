# Resync a branch someone else rewrote

Status: built (2026-11-06, branch `resync-branch`), steps 1 to 6; spec in
[`docs/spec/rebase.md`](../../spec/rebase.md#branch-moved-on-github). D1 to D3 as proposed (button only; the phase stays;
split tickets are not flagged at all, since their poll goes through the stack, rather than flagged and refused).
D4 not built: the notice does not say who moved the branch. R1 is handled with the checks poll's last head
(`pr_checks_sha`): a head behind the push is a move only when it was already the head at the poll before. `retry` is
held back too. Revise and Retry are refused by the web with the reason rather than disabled in the UI. Tried on
real Docker (ticket 9001, a local bare repository as GitHub): the refusal on an unpushed commit, then the resync.
Ticket 24, which prompted this, was merged in the meantime.

## Why

Union treats its ticket's workspace as the source of the branch: it pushes from it, and it checks what it fetches
back against it. When someone else pushes to the ticket's branch on GitHub, and especially when they rebase or
force-push it, Union doesn't notice. The workspace keeps the old history:

- The PR tab still says "Up to date with `<base>`". The behind count reads GitHub's branch, not the workspace.
- The next **Rebase**, **Simplify** or split stops at the fetch with "`<branch>` on GitHub has commits this
  ticket's workspace does not: rewriting would drop them" (`fetchChecked`, `rebase-attempt.ts`). That refusal is
  correct, but it comes late and offers no way out.
- A revision pushes without a lease, so GitHub refuses it as a non-fast-forward after the agent has already run
  (and used Claude usage).
- The review diff and the final review read the workspace's old commits.

Seen on ticket 24 (2026-11-06, PR #1659, Done). Union's last rebase pushed `461e760`, and the next poll had it
22 commits behind `senova-dev`. A co-worker then rebased the branch on GitHub: the PR head is now `c9ffb82` and
`behind_by` is 0. Union still holds `461e760` in `union-t24-ws`. It already reads the new head through the checks
poll (`pr_checks_sha`), but never compares it with what it pushed.

## Design in short

1. **Remember what Union pushed.** New column `tickets.pushed_sha`, set after every push Union makes:
   `pushBranch` (`publish.ts`; implement, revision and rebase pushes all go through it) and the stack push
   (`stack-push.ts`). A migration fills it from each ticket's latest `diff_updated.headSha`, the closest record
   of the last push.
2. **Notice the move in the regular poll.** `refreshPullRequest` (`github/pull-request.ts`) already fetches the
   PR, so its `head.sha` comes free. When an open PR's head differs from `pushed_sha` and no step runs or is
   paused, one compare call (`compare/<pushed_sha>...<head>`) sorts the move:
   - `ahead`: commits were added on top of Union's (`status: ahead`). A fast-forward is safe.
   - `diverged`: the branch was rewritten (a rebase or a force-push; `status: diverged` or `behind`).

   Store it in a new column `tickets.remote_moved` (`{ from, to, kind: 'ahead' | 'diverged' }`) and emit
   `branch_moved { from, to, kind }`, declared in `event-payloads.ts`. When the head comes back to `pushed_sha`,
   or after a resync, clear the column (event `branch_resynced`).

3. **Flag it.**
   - **PR tab**: a notice above the behind count. For a rewrite: "The branch was rewritten on GitHub
     (`461e760` → `c9ffb82`). Union's copy is out of date." For added commits: "2 commits were pushed to the
     branch on GitHub." Either way, with a **Resync from GitHub** button.
   - **Board card**: a small "branch moved" badge, like the PR checks badge.
   - While the flag is set, the actions that write the branch (Rebase, Revise, Simplify, Split, Change target)
     are disabled with the reason, and the web refuses their commands. The user resyncs first instead of hitting
     a late failure.
4. **Resync as a worker command.** The web inserts a `resync_branch` row into `commands`. It is accepted only
   when the flag is set and no step runs. The worker then:
   1. starts the ticket's container if it is stopped (as Commands does);
   2. fetches with `fetchIntoContainer`, so credentials stay on the host;
   3. refuses when the workspace holds commits that were never pushed (`HEAD` is not `pushed_sha`, or the
      worktree is dirty), because the reset would drop them. The message names the commits;
   4. runs `git reset --hard origin/<branch>` on the ticket's branch;
   5. recaptures the diff snapshot (`diff-snapshot.ts`), sets `pushed_sha` to the new head, clears
      `remote_moved` and emits `branch_resynced { from, to }`;
   6. writes a Log line: "Resynced from GitHub: `461e760` → `c9ffb82` (rewritten by someone else)."

   Nothing is pushed and no agent runs: it touches neither GitHub nor Claude usage. The phase doesn't change, so
   this is a plain worker command like `union_update_check`, not a state-machine action, and `states.ts` stays as
   it is.

5. **Tell the next agent.** The implementer's session remembers the old code. The next run resumed after a resync
   gets one line before its prompt: "The branch was rewritten on GitHub since your last run (`461e760` →
   `c9ffb82`); re-read the files you change." Keep a `resynced_from` marker on the ticket, cleared by the run that
   reads it.

## Decisions to confirm

- **D1 — Auto-resync `ahead`?** Commits added on top fast-forward safely. Proposal: keep the button for v1 and
  auto-resync later, once the button has been used on real tickets.
- **D2 — Review state.** After a resync the code under review changed. Proposal: a ticket awaiting its final
  review keeps its phase, and the review's "changed since review" view (`reviewed_sha`) shows the new commits. A
  Done ticket stays Done. No final review runs again on its own.
- **D3 — Split tickets.** Each slice is a branch someone may rewrite. Proposal: v1 flags a split ticket but
  refuses the resync ("resync each slice is not supported yet"). A later step resyncs the whole stack from
  `remoteSliceBranches`.
- **D4 — Who moved it.** The compare call doesn't say. Proposal: read the head commit's committer for the notice
  ("rewritten by @name"), without a separate events API call.

## Steps

1. Schema: `pushed_sha`, `remote_moved`, `resynced_from` on `tickets`, plus a migration that fills `pushed_sha`.
   Record `pushed_sha` in `pushBranch` and the stack push. Tests for the fill.
2. Detection in `refreshPullRequest`, a pure `classifyMove(compare)` helper with tests, the two events.
3. The `resync_branch` command: web route and checks, worker handler (fetch, unpushed-commit check, reset,
   snapshot, Log). Verify against real Docker with ticket 9001 (`docs/architecture/testing.md`): rewrite the branch
   from outside, then resync.
4. UI: the PR tab notice and button, the card badge, the disabled actions. UI check with `scripts/ui-check/`.
5. The note to the next agent (`implement-prompts.ts`).
6. Docs: spec (`docs/spec/rebase.md` gets a "Branch moved on GitHub" section, or a new `docs/spec/resync.md`),
   `docs/architecture/worker.md`, and the user guide page for the Pull request tab.

## Risks

- **R1 — A poll between Union's push and GitHub's update.** The PR head can lag the push by a second, which would
  flag a move that didn't happen. `pushed_sha` is written before the next poll, and a head equal to an ancestor of
  `pushed_sha` (`status: behind` with no commits of its own) is ignored for one poll before it is flagged.
- **R2 — An agent's unpushed work.** A paused or failed step can leave commits in the workspace. Step 4.3 refuses
  the reset in that case. The user then decides: retry the step first, or drop the work (a later "Resync anyway"
  is out of scope for v1).
- **R3 — Ticket 24 today.** After step 1's fill, its `pushed_sha` is `461e760`. The first poll flags `diverged`,
  and the button brings `c9ffb82` in.
