# Rebase

Once implementation is done (final review, or Done while the PR is still open), the ticket's PR tab shows how far the
branch is behind the base branch ("4 commits behind `main`") and a **Rebase** button. The host tries `git rebase`
itself first; the implementation agent is called only when it stops on a conflict, or when the checks fail after it.
The host pushes the result.

## Flow

1. **Pull request state and behind count:** during its regular pull, the worker asks GitHub about every ticket's
   pull request and stores its state (`tickets.pr_state`: open, closed or merged; a merged one is final and no longer
   asked about). For tickets that could be rebased (at the final review, Done, or after a failed rebase) with an open
   pull request, it also stores how far behind it is (`tickets.behind_by`, from `compare/<PR base>...<head>`); null
   otherwise. No count, no button (the web refuses the command too): a branch that is up to date shows "Up to date
   with `main`", a merged pull request "The pull request is merged".
2. **Fetch for the container:** the container has no GitHub credentials, so the host fetches the base branch and
   the pushed branch with the project's credentials, writes them as a `git bundle`, copies it in and fetches from it
   inside the container (`origin/<base>`, the local `<base>` that diffs compare with, and `origin/<branch>`). If the
   pushed branch has commits the workspace lacks (someone pushed), the rebase stops before the agent runs: rewriting
   would drop them.
3. **Host rebase first (decided):** the host runs `git rebase origin/<base>` in the container (no hook runs on
   picked commits). A branch already holding the base is up to date: nothing is pushed and no agent runs. A clean
   rebase runs the project's check command; when it passes, the host pushes (step 5) and no agent runs. Each case
   writes a line to the Log.
4. **Agent run, only when needed (decided):** when git stops on a conflict, the host aborts the rebase (the branch
   is as it was) and calls the agent with the conflicting files; when the rebase was clean but the checks fail, it
   keeps the rebased branch and calls the agent with the checks' output. The agent is the same implementation
   agent, started with `claude -p --resume <implement session id>` and the rebase prompt, on the Implementation
   model. There is no separate rebase agent; the rebase prompt is its own page in Union settings (default: say why
   it is called, rebase onto `origin/<base>`, resolve conflicts keeping both intents, run the project's checks, fix
   what the rebase broke, abort if unsafe, never push). Allowed tools add `git rebase`, `git merge-base`, `git add`
   and `git status`; push, checkout, reset and branch deletion stay denied. A lost session falls back to a fresh one
   given the task and the approved plan first. A run with no agent saves no session, so the next one still resumes
   the implementer's. The host then checks the result: no rebase left unfinished, still on the branch,
   `origin/<base>` now in its history; it runs the project's check command.
5. **Push:** on success the host force-pushes with `--force-with-lease` on the commit it fetched (the rebase
   rewrites history), so a commit pushed by someone else in the meantime is never overwritten; the PR updates by
   itself, and the review diff is captured again. The step's report (the agent's: conflicts met and how they were
   resolved; or the host's for a clean rebase; then the check results) becomes the step's output and issue comment.
6. **Back to review (decided):** when the agent ran, it changed code, so `final_review` runs again and the ticket
   returns to awaiting final review; a ticket that was Done goes back to In review. When no agent ran (up to date,
   or clean with the checks passing), the reviewed code is unchanged: the ticket goes back to its final review,
   keeping the review from before, or to Done. Accepted risk: a clean rebase with green checks can still change
   behaviour no test covers; the pull request's human review is there for that.

## Failure

- Conflicts the agent cannot resolve, checks that still fail, or any other failure: the host aborts any rebase in
  progress and resets the branch to the commit it started from, so it is left exactly as it was (and unpushed),
  and the ticket goes to `failed` on the `rebase` step with the reason and the agent's report. **Retry** runs it
  again. Not yet: **Revise** to give the agent guidance first ("keep our version of the API client").
- Push rejected by the lease (the remote branch moved): `failed` with a message; nothing is overwritten.

## State machine

New action `rebase`, allowed from `awaiting_approval` on `final_review` and from `done` (the web checks the PR is
open), leading to `running` on the `rebase` step with `thenRun: final_review` (and `thenDone` from Done), so
`run_finished` leads to `running` on `final_review`; a retry keeps that chain. When no agent ran, the worker
dispatches `rebased_clean` instead, which leads back to `awaiting_approval` on `final_review`, or to `done` with
`thenDone`. `rebase` is a `Step` but not a pipeline step (`STEPS`); it shows on the board as In review.
