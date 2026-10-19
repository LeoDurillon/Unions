# Pull requests

The project bar's **Pull requests** tab lists the repository's pull requests, read from GitHub by the web server
(GraphQL, read only, newest 100 by last update): Open (the default), Closed (closed and merged) or All. Each shows its
state (open, draft, merged, closed), author, branches, review decision, size and, when a ticket is linked to it, an
**Open ticket** button. It is fetched when the tab opens, at most once a minute, or on **Refresh**: live events do
not refetch it.

A pull request without a ticket shows **Add to reviews** on hover (or keyboard focus): it joins the **Current
reviews** tab, per project (`current_reviews`, a snapshot of its title, author and branches, so the tab needs no
GitHub call), where it can be removed.

**Open review** opens the same review page as a ticket's (file list, highlighted unified or split diff, comments on
a line or a block of lines), with four tabs: **Description** (the pull request's description) and **Comments** (its
review summaries, conversation comments and line threads, read only), both read from GitHub once per opening,
**Notion** once the review is linked to a page, **Preview** (see [Previews of pull requests under review](preview-environments.md#previews-of-pull-requests-under-review)), then **Diff**. The pull request's head commit and files are read from GitHub when the page opens and
kept on the review (`current_reviews.files`, `head_sha`): comments are checked against those lines, and those
written on an earlier head read as outdated. **Send review** offers **Comment**, **Approve** and **Request changes**;
each queues a `submit_pr_review` command with that verdict, and the worker posts one review of that kind on the pull
request: the overall note as its body, each draft on the reviewed head as a line comment, and the others quoted in the
body with their code (GitHub refuses line comments outside the current diff). An approval may be sent with no draft
and no note; a comment or a request for changes needs one of them. The posted drafts turn sent; a failure (GitHub
refuses, for one, an approval or a request for changes on the user's own pull request) leaves them drafts and shows
GitHub's reason (`submit_status`).

A review is linked to the Notion page it implements from its **Description** tab: **Notion page** takes a page URL
or ID, reads it through the project's integration (any page shared with it, not only rows of its data source) and
shows its title before **Link**; once linked, the row shows the title (a link to Notion), **Change** and **Unlink**.
Only the page's id, title and URL are kept on the review (`current_reviews.notion_*`); the **Notion** tab, after
Description, reads the page's text from Notion once per opening (cleaned as a ticket's import, mention titles
resolved, folded when long), with **Refresh**. Nothing is written to Notion or GitHub.

**CI checks** of a ticket's pull request ([`docs/plans/pr-checks.md`](../plans/pr-checks.md)), in the PR tab under the branch status, while
the PR is not merged (read when the tab opens, every 30 s while a check runs, and on Refresh): the web reads the head commit's check runs and commit statuses and the PR's bot comments. The user picks failed checks, other
GitHub Actions jobs of the head (their findings may be there) and bot comments; each is read again into text (a
failed check's link, annotations and failed step's log; a job's log without the scripts its steps echo; a comment's
body), previewed, then kept for the implementer's next run or sent now as one revision with a note (at the final
review or once done), in `ci_outputs`. The implementer reads them as data in a "Failed CI checks" section after the
command outputs, the newest 6 blocks, once. The GitHub App needs read access to Checks, Commit statuses and Actions.

**Checks failed**: the worker reads the overall state of the open PR's checks (the head commit's rollup, one GraphQL
call) in the same poll as the PR's state, keeps it on the ticket (`pr_checks_state`, `pr_checks_sha`) and logs
`pull_request_checks_failed` when they turn red: on a commit already seen without red checks (a re-run that fails
again counts), or on a new head. The first read of a ticket's checks says nothing. The event notifies in Union
("Checks failed") and is the rule trigger "Its pull request's CI checks fail". Without the Checks permission the
state stays unknown and nothing notifies. The same state is a badge on the ticket's board card while the PR is open
(Checks running, passed or failed).

**Re-run** on a failed GitHub Actions job (PR tab): the web checks the job against the current listing and queues
`rerun_ci_job`; the worker asks GitHub to run it again with the jobs that depend on it (`github/ci-rerun.ts`) and
logs `ci_job_rerun`, or `ci_job_rerun_failed`, which notifies ("Re-run failed", naming the permission on a 403). The
button reads "Re-run asked" until GitHub lists the new run (the tab reads the checks every 10 s meanwhile, 2 minutes
at most). The GitHub App needs Actions read and write; other CI is re-run where it runs.
