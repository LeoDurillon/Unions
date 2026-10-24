# Pull requests

The project bar's **Pull requests** tab lists the repository's pull requests, read from GitHub by the web server
(GraphQL, read only, newest 100 by last update): Open (the default), Closed (closed and merged) or All. Each shows its
state (open, draft, merged, closed), author, branches, review decision, size and, when a ticket is linked to it, an
**Open ticket** button. It is fetched when the tab opens, at most once a minute, or on **Refresh**: live events do
not refetch it.

A pull request without a ticket shows **Add to reviews**: it joins **Under review**, the
part at the top of the same tab, per project (`current_reviews`, a snapshot of its title, author and branches, so the
part needs no GitHub call), where it can be removed (after a confirmation: its drafts and preview go with it).

**Stacks** come from GitHub's stacked pull requests (`GET /repos/{o}/{r}/stacks`, read with the list; up to 500 open
stacks): a stack is one row under "Stacks", above the other pull requests, in every filter, with its size on GitHub,
how many of it merged, and its members (bottom first) when opened, those the list does not show named below them.
**Add stack to reviews** adds its members without a ticket; a split ticket's stack (its slices are linked to the
ticket) offers **Open ticket** instead. Pull requests that only target each other's branches are not a stack, except
where GitHub has no stacks (the list answers 404): there open ones are chained by branch, as before. Reviews under
review keep each pull request's GitHub stack and place (`current_reviews.github_stack_number`, `stack_position`), written
when it is added and again each time its files or the list are read; they are grouped by it, a ticket-linked member
in the middle leaving the stack whole but out of the review's tabs. **Review with agent** on a stack and **Link the
whole stack** take the stack as GitHub has it.

**Open review** opens the same review page as a ticket's (file list, highlighted unified or split diff, comments on
a line or a block of lines), with four tabs: **Description** (the pull request's description) and **Comments** (its
review summaries, conversation comments and line threads, read only), both read from GitHub once per opening,
**Notion** once the review is linked to a page (**Notion (2)** for two), **Preview** (see [Previews of pull requests under review](preview-environments.md#previews-of-pull-requests-under-review)), then **Diff**. The pull request's head commit and files are read from GitHub when the page opens and
kept on the review (`current_reviews.files`, `head_sha`): comments are checked against those lines, and those
written on an earlier head read as outdated. **Send review** offers **Comment**, **Approve** and **Request changes**;
each queues a `submit_pr_review` command with that verdict, and the worker posts one review of that kind on the pull
request: the overall note as its body, each draft on the reviewed head as a line comment, and the others quoted in the
body with their code (GitHub refuses line comments outside the current diff). An approval may be sent with no draft
and no note; a comment or a request for changes needs one of them. The posted drafts turn sent; a failure (GitHub
refuses, for one, an approval or a request for changes on the user's own pull request) leaves them drafts and shows
GitHub's reason (`submit_status`). A posted review logs `pr_review_posted` with its verdict, on the ticket whose
pull request it is if there is one; the event rule trigger **You post a review of its pull request** (any verdict, or
Approved, Changes requested, Commented) waits for it. Its Notion action sets every page the review is linked to, else
the ticket's page; its other actions need that ticket and skip a pull request without one. Templates can use
`{review.verdict}` and `{review.url}`.

A review is linked to the Notion pages it implements (usually one, sometimes several) from its **Description** tab:
**Notion pages** takes a page URL or ID, reads it through the project's integration (any page shared with it, not
only rows of its data source) and shows its title before **Link**; each linked page shows its title (a link to
Notion) and **Unlink**, and **Link another page** adds one. The Notion pages the pull request's description links
to, and the integration can read, are offered as one-click suggestions ("Link _Export to CSV_"), never linked on
their own. Each pull request of a stack has its own pages; when others of its stack have none, **Link the whole stack
to this page** gives them that one. The Under review list marks a linked review (and a stack's linked members) with
**Notion** (with the count when several). The **Notion** tab, after Description, reads each page's text from Notion
once per opening (cleaned as a ticket's import, mention titles resolved, folded when long), with **Refresh**.
Nothing is written to Notion or GitHub.

### Specs

Every review page has one list of **specs**, in the **Specs** bar under its header, read by **Review with agent**,
**Explain** and **Group by spec** ([plan](../plans/review-specs.md)). It starts, the first time the page reads it,
with the ticket's text and the Notion page the ticket came from, or the pull request's description; a page linked to
a pull request is one of its specs (linking adds it, unlinking removes it). **Edit** opens the list: each spec's
text (read from its source each time, so a page or a description edited meanwhile is read as it is now), **Edit**
to change it (the edited text is kept on the review, for everyone and every later run, marked "edited"), **Use the
source** to go back to reading it, **Remove**, and **Add a spec** from the PR description, the ticket, a GitHub issue
or any Notion page (a page added there is linked like one added from the Description tab). A source that cannot be
read (a page no longer shared) shows in red and is left out of the runs. The list is kept in `review_specs`; a
removed starting spec stays removed. **Review with agent** and **Group by spec** list the specs they will read, with
**Edit the specs**; a stack's agent review reads every member's specs, each linked to its pull request, a page
linked to several members once, linked to all of them. Group by spec reads them as one text, each a titled section,
so its parts can come from any of them.

### Explain

On either review page (a ticket's branch or a pull request under review), **Explain** asks an agent about lines of
the diff: in the editor under selected lines (with an optional question folded under **Ask a question**), on a hunk
header, or **Explain file** beside the file's name. The answer comes in the **Explain** side panel, on the right of
the diff, opened by the header's **Explain** toggle (with the count on the way, remembered in the browser) or by
asking. Each explanation shows its lines (a link that opens the file and selects them), the **Spec parts** a
grouping by spec put them under (from the newest grouping, without the agent; "older grouping" when it read another
commit), "Waiting for a run slot" or "Explaining…" with the agent's last steps and **Cancel**, then the answer:
**How it works** (with links to the code it cites in the change), **Specs** (quotes of the specs, each with its
source), **Docs** (the repository's own documents) or **Not in the spec**. The host keeps a spec quote only when it is
found in a spec that was sent, and a doc only when its path is in the checkout; the panel counts what it dropped.
**Ask a follow-up** resumes the agent's session on a ticket (a pull request's runs again with the thread), and
**Copy as comment** opens the comment editor on the lines with the answer quoted, nothing sent. Older explanations
are folded below the newest; one asked on another commit is **Outdated**, with **Explain again**.

The specs are the review's (its **Specs** bar). The agent is `review_explain` in Union settings (Haiku by default, read-only
tools and git reads). A ticket's runs in its own container, refused while the ticket runs; a pull request's in a
throwaway container cloned at the reviewed commit. Runs share the run slots, one per review at a time. Each Explain
is one agent run on the user's Claude usage; nothing is written to GitHub or Notion.

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
