# Flow

0. First run: a setup wizard connects GitHub (token or GitHub App installation), picks the repository, and under
   Integrations optionally picks or creates the GitHub Project (none by default; the `project` scope is checked only
   then) beside Notion and Jira.
1. Create a ticket (title, description), or import it from a tracker the project is connected to (the wizard's
   optional Integrations step, or project settings): from Notion (integration secret + data source; the page must be
   a row of that data source), or from Jira Cloud (site, account email, API token + project key; the issue must be
   of that project, its description converted to markdown and its attachments kept as ticket files)
   → GitHub issue (when the project mirrors issues) added to the Project (when it has one). Union writes to Jira only from the worker: event rules move the issue, set its fields or comment, the Jira tab posts comments, and an investigation can create an issue. Or import an existing issue of the repository (number or URL; pull requests
   and issues already on a ticket are refused): the ticket is on that issue, which the sync adds to the Project
   instead of creating one, and its title and description keep following GitHub. A Notion page edited before
   creating (Edit before creating) stays linked to the ticket and still gets its images, unless unlinked in the form.
   The Overview's **Edit** changes the title and description afterwards: the worker writes them to the issue, unless
   it changed on GitHub since the edit was opened (then nothing is written and the edit says so); the Notion page is
   not changed, and steps already done do not run again.
   Or import an open pull request of the repository (number or URL; one from a fork, closed, merged, or already on
   a ticket, or whose issue is, is refused): the ticket is on the pull request's branch and base, linked to it, its
   head recorded as pushed. When the pull request closes an issue holding Union's step comments, the ticket is on
   that issue and its planning steps are prefilled from them (version, validation, comment kept and edited later);
   its flow is those steps, then implementation and final review; else it is on the first issue the pull request
   closes, if any, and runs the Quick flow. The pull request's description is the implementation's output; the
   worker (`adopt_pull_request`) moves the ticket to awaiting approval at Implementation, then checks the branch
   out and captures its diff (no agent). Approve runs the final review; Revise runs the implementer on the branch,
   with no session. Plan: `docs/plans/archive/pr-import.md`.
2. Move to In Progress (the card's or the Overview's **Start** button; the card moves at once, "Starting…") → the worker creates volumes + container, clones the repo into the workspace volume.
   A ticket that depends on another one cannot start before it is done (see [Ticket dependencies](ticket-dependencies.md)).
3. Planning steps, each a tab on the ticket: `intake` (Haiku) → `summary` (Sonnet) → `technical` (Opus) → `test_plan` (Sonnet),
   or only those the ticket's flow keeps (none for a Quick ticket), with the user's [custom agents](custom-agents.md)
   where the flow places them (one may also run after the implementation, before the final review).
   After each, the user clicks **Approve** or **Request revision** (with feedback), which resumes the agent session.
   **Start over** (`start_over`, while the step awaits approval, failed or hit the usage limit) runs it again from
   scratch: the phase carries `fresh`, so the run resumes no session and its prompt has no earlier version or
   feedback; a fresh run that stops retries fresh. Earlier versions stay in the history. Planning and custom steps
   only: they change no file.
   Each step's output is posted/edited as one issue comment, on a ticket that has an issue; else it stays in Union.
4. After the last planning step is approved (at once for a flow without planning): `implement` loop (agent turn → checks → back to the agent on red, up to the
   project's iteration limit), then the host measures the change (`size-trim.ts`): the lines of code added from
   `git diff --numstat <base>...HEAD`, tests, lock files, migrations and Markdown counted apart (the project's
   `sizeIgnore` patterns replace that list), against the budget: the approved technical plan's `Estimated size: <n>
   lines of code`, else the project's `sizeBudget`, else none. Each measure is a `change_measured` event and a
   **Size** line of the report. A first implementation (no revision, not a resumed run) with green checks over 1.5
   times its budget gets one trim pass: its session is resumed with the figures and the `trim` prompt, the checks run
   again, and it measures again; a trim pass that fails (agent error, usage limit, refused commit, red checks) is
   undone with `git reset --hard` and the change goes on as implemented. Nothing blocks on the size. Then the host
   pushes the branch and opens a draft PR (`Closes #n`). Before opening
   it, one more turn in the implementer's session writes the PR description: it fills in the repository's pull
   request template when there is one (`.github/`, root or `docs/`, any case, else the first file of
   `.github/PULL_REQUEST_TEMPLATE/`), in the template's language, else a short summary, changes and testing in the
   ticket's language. The host adds `Closes #n` (and the stacked-PR note) below it; if the turn fails, the PR gets
   that default body. An existing PR is never redescribed. Install and check commands are set per project. Reviewer
   agents are the user's [custom agents](custom-agents.md): a step placed after the implementation, or a review
   agent run from a review page. The refactor pass is not built yet.
5. `final_review`: a fresh review agent (read-only plus `git diff/log/show/status`) compares the branch with the approved
   plan and starts its review with `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`. It does not re-run the
   checks; it states the last result from the implementation report. Only bugs, missing acceptance criteria,
   missing planned tests, risky changes and code the task does not need request changes; other remarks go under "Optional". A review of a branch
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
   A ticket written in Union or imported from GitHub can be linked afterwards, from the Overview, to a Notion page
   or to an issue of the project's Jira project (`routes/ticket-*-link.ts`): it becomes the ticket's origin, as if
   imported, its text unchanged; a ticket has one origin, so linking the other tracker's item or unlinking it is
   refused (409).
   The ticket panel's tabs: **Overview** (description, links, actions, runs), **Preview**, **Steps** (one tab per
   step, then the Log; it follows the running step), **PR** (link the pull request, then its GitHub discussion, with
   Reply, Quote reply and the implementer's suggested replies: see
   [Replies to comments](pull-requests.md#replies-to-comments)), then **Notion** (the open discussions of the
   ticket's Notion page, read when the tab opens, with Reply in each and New comment, which the worker posts;
   enabled for a ticket linked to a page) or, in its place for a ticket imported from Jira, **Jira** (the issue's
   comments, the latest 500, read when the tab opens, with Reply, a new comment mentioning the author, and New
   comment, which the worker posts; Add to review makes one a `general` draft, sent under "On the spec (Jira
   comments)" and asked no reply). From the PR tab or the review header, **Import** adds the unresolved line-comment threads as drafts,
   replies folded in with their authors; each lands on its lines of the current diff, or reads as outdated with
   GitHub's excerpt when those lines are gone. Review summaries and conversation comments are added one by one
   (**Add to review**), since bots post many of them: they become `general` drafts (no file or lines), sent under
   "On the pull request" before the line comments. A discussion of the ticket's Notion page is added from the
   Notion tab (**Add to review**, once the ticket has a branch): the whole thread as one `general` draft, sent
   under "On the spec (Notion comments)" after "On the pull request"; it asks for no reply. `review_comments.source_url`
   (the GitHub comment's link, or `https://www.notion.so/<page>?d=<discussion>`) makes a re-import skip what is
   already there. HTML comments and layout tags are dropped from GitHub text (`githubText`). Sent, imported comments
   ask the implementer for a reply to their author once its revision is pushed (`reply_status = 'requested'`).
   Cancelling a ticket closes its open pull requests (a stack's too) and its issue as not planned, once its agent
   stopped; merged pull requests and the branch stay, and what is reopened on GitHub is left alone.
6. Once nothing comes back to the ticket (its pull request merged, a stack's once every slice is, or the ticket
   cancelled), the worker removes its preview (containers, networks, volumes and the images it built), then its
   container and volumes, and clears `container_name`, `home_volume` and `workspace_volume`; it waits while a step,
   a side run, a preview command, e2e tests or an unhandled command is on the ticket. Removing the ticket or deleting
   the project removes them too. Done alone keeps them, so the preview still works after approval and the pull
   request can still be revised; a pull request closed without a merge keeps them too, since it can be reopened.
