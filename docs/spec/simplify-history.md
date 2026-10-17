# Simplify history

While the ticket's pull request is open, its PR tab shows **Simplify history**, usable at the final review or once
Done. The implementation agent rewrites the branch's commits into a history a reviewer reads commit by commit
(fix-ups folded in, one commit per logical change, messages in the repository's style); the code must not change.

1. **Fetch:** as for a [rebase](rebase.md), the host brings the base and the pushed branch into the container as a bundle; a
   pushed branch with commits the workspace lacks stops it before the agent runs.
2. **Agent run:** `claude -p --resume <implementer session>` with the `simplify` prompt (Union settings → Simplify
   history), told the branch and its fork point (`git merge-base HEAD origin/<base>`). Allowed tools add `git reset`,
   `git rebase`, `git add`, `git apply`, `git commit` and `git status` (no editor: `rebase -i` and `add -p` cannot be
   used); push, checkout and branch deletion stay denied.
3. **Refused commits:** a hook is never bypassed by the agent. When one refuses a commit, the agent stops, leaves
   what is not committed yet staged and ends its report with `Refused commit: <message>`; changes it left without
   one are committed with a message asked from its session, as for the implementer. A refusal pauses the step
   (`commit_refused` on `simplify`, `thenDone` kept) with the files and the hook's output, nothing pushed. The user
   either commits them without the hooks (the last commit of the new history), then the checks and the push run;
   or keeps the old history: the branch is put back as it was and the ticket returns where it was. Leaving the
   changes out is not offered, since it would change the code.
4. **Checks by the host:** no rebase left unfinished, still on the branch, nothing uncommitted, the same fork point
   (moving onto a newer base is a rebase), and the same tree at the end (`HEAD^{tree}`). No install, checks or agent
   services run: the code is the same.
5. **Push:** force-push with `--force-with-lease` on the fetched commit, then the review diff is captured again
   (`branch_pushed` with `simplified: true`). A history left as it was pushes nothing. The agent's report and the
   commit counts are the step's output and issue comment.
6. **After:** the final review still stands, so the ticket returns to awaiting final review, or to Done when it
   came from there (`thenDone` in the phase, kept through a failure and its retry). Any failure puts the branch back
   as it was, unpushed, with the reason and the agent's report; **Retry** runs it again.

State machine: action `simplify`, from `awaiting_approval` on `final_review` (→ `running` `simplify`) and from
`done` (→ `running` `simplify` with `thenDone`); `run_finished` leads back. `simplify` is a `Step` but not a
pipeline step; it shows on the board as In review while it runs.
