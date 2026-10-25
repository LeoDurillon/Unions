# Flow

0. First run: a setup wizard connects GitHub (token or GitHub App installation), picks the repository, and picks or creates the GitHub Project.
1. Create a ticket (title, description), or import it from Notion when the project is connected (optional wizard
   step or project settings: integration secret + data source; the page must be a row of that data source)
   → GitHub issue added to the Project. Or import an existing issue of the repository (number or URL; pull requests
   and issues already on a ticket are refused): the ticket is on that issue, which the sync adds to the Project
   instead of creating one, and its title and description keep following GitHub. A Notion page edited before
   creating (Edit before creating) stays linked to the ticket and still gets its images, unless unlinked in the form.
   The Overview's **Edit** changes the title and description afterwards: the worker writes them to the issue, unless
   it changed on GitHub since the edit was opened (then nothing is written and the edit says so); the Notion page is
   not changed, and steps already done do not run again.
2. Move to In Progress (drag the card, or its **Start** button) → the worker creates volumes + container, clones the repo into the workspace volume.
   A ticket that depends on another one cannot start before it is done (see [Ticket dependencies](ticket-dependencies.md)).
3. Planning steps, each a tab on the ticket: `intake` (Haiku) → `summary` (Sonnet) → `technical` (Opus) → `test_plan` (Sonnet),
   or only those the ticket's flow keeps (none for a Quick ticket), with the user's [custom agents](custom-agents.md)
   where the flow places them (one may also run after the implementation, before the final review).
   After each, the user clicks **Approve** or **Revise** (with feedback). Revise resumes the agent session.
   Each step's output is posted/edited as one issue comment.
4. After the last planning step is approved (at once for a flow without planning): `implement` loop (agent turn → checks → back to the agent on red, up to the
   project's iteration limit), then the host pushes the branch and opens a draft PR (`Closes #n`). Before opening
   it, one more turn in the implementer's session writes the PR description: it fills in the repository's pull
   request template when there is one (`.github/`, root or `docs/`, any case, else the first file of
   `.github/PULL_REQUEST_TEMPLATE/`), in the template's language, else a short summary, changes and testing in the
   ticket's language. The host adds `Closes #n` (and the stacked-PR note) below it; if the turn fails, the PR gets
   that default body. An existing PR is never redescribed. Install and check commands are set per project. Reviewer
   agents and the refactor pass are not built yet.
5. `final_review`: a fresh review agent (read-only plus `git diff/log/show/status`) compares the branch with the approved
   plan and starts its review with `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`. It does not re-run the
   checks; it states the last result from the implementation report. Only bugs, missing acceptance criteria,
   missing planned tests and risky changes request changes; other remarks go under "Optional". A review of a branch
   reviewed before is given the earlier review, what the user sent the implementer since, and the commits since
   the one it read: it says which earlier findings are fixed or still open, and does not raise again a point the
   user declined. The user decides: **Approve** marks the PR
   ready for review and moves the ticket to Done; **Request changes** (or **Send findings to the implementer**,
   which pre-fills the request with the review's findings) resumes the implementer, whose output is accepted
   automatically and followed by a new review, without an approval in between. Nothing loops on its own.
   From final review onward the user can run the ticket's branch as a live preview (see [Preview environments](preview-environments.md)),
   rebase it onto the latest base branch (see [Rebase](rebase.md)), simplify its commit history (see [Simplify history](simplify-history.md)), and split it into a stack of pull requests (see [Stacks of pull requests](pr-stacks.md)).
   **Review changes** opens a full-page diff of the branch (files on the left, one file at a time), built from a
   snapshot the worker saves after each implementation run, syntax-highlighted, unified or split (side by side; the
   choice is remembered in the browser). The user comments on a line or a block of lines; the
   comments stay local drafts until **Send review**, which is allowed when the ticket waits on the user at the
   implementation or the final review, or once it is Done (its branch is kept and its pull request is not merged),
   and works like Request changes: the
   implementer works on the comments, then the final review runs again (from Done, the feedback is recorded on the
   final review and the ticket goes back to In progress).
   **Explain** asks an agent about selected lines, a hunk or a file, in a side panel (see
   [Pull requests](pull-requests.md#explain)); it is refused while the ticket runs.
   The ticket panel has three tabs: **Overview** (description, links, actions, runs), **Worker** (one tab per step,
   then the Log; it follows the running step) and **PR** (link the pull request, then its GitHub discussion, with
   Reply, Quote reply and the implementer's suggested replies: see
   [Replies to comments](pull-requests.md#replies-to-comments)). From the PR tab or the review header, **Import** adds the unresolved line-comment threads as drafts,
   replies folded in with their authors; each lands on its lines of the current diff, or reads as outdated with
   GitHub's excerpt when those lines are gone. Review summaries and conversation comments are added one by one
   (**Add to review**), since bots post many of them: they become `general` drafts (no file or lines), sent under
   "On the pull request" before the line comments. `review_comments.github_url` makes a re-import skip what is
   already there. HTML comments and layout tags are dropped from GitHub text (`githubText`). Sent, imported comments
   ask the implementer for a reply to their author once its revision is pushed (`reply_status = 'requested'`).
6. On archive (or project deletion) the containers and volumes are removed. Done alone keeps them, so the
   preview still works after approval.
