# Built plans

Plans built since Union started, kept as the record of what was decided and why. What they built is described in
the spec (`docs/spec/`); open work is in the [plans README](../README.md).

- [UI/UX review](ui-review.md): built (2026-10-24), steps 1 to 5: quick wins, action hierarchy,
  navigation, the board and per-page fixes.
- [One set of specs per review](review-specs.md): a Specs bar read by Review with agent, Explain and Group by
  spec, saved edits, several Notion pages per pull request. Built (branch `review-specs`).
- [Agent services on localhost](agent-service-ports.md): forward the agent services' published ports to the ticket
  container's `localhost`, choose which variables the agent's commands get, give Commands the same environment.
  Built (branch `agent-service-ports`).
- [CI checks of the pull request](pr-checks.md): list the PR's checks in the ticket's Pull request tab, and give the
  failed ones (log of the failed step, annotations, other jobs' logs, bot comments) to the implementer. Built,
  steps 1 to 5 (branch `pr-checks`).
- [Stacked PRs in Pull requests and Current reviews](stacked-pr-reviews.md): a stack shows as one item, its review
  page picks a PR in a segmented control, and the agent reviews the whole stack against several specs linked to its
  PRs. Built, steps 1 to 4 (branch `stacked-pr-reviews`); one v1 item left (the size warning).
- [Review a split ticket slice by slice](slice-reviews.md): a slice picker on the ticket's review page, comments
  written on a slice's own diff, and the GitHub import pulling every slice's pull request onto its slice. Built (branch `slice-reviews`).
- [The review page's slice in the URL](review-slice-url.md): `?slice=2` (then `?tab=`), so Back and Forward move
  between the slices looked at and a reload keeps one. Built, steps 1 to 3 (with the pull requests under review, `?review-pr=`).
- [Read stacks from GitHub](github-stack-reads.md): the Pull requests and Current reviews tabs, the stack agent
  review and the stack's Notion link take stacks from GitHub's stacks API instead of chaining branches. Built
  (branch `github-stack-reads`, 2026-10-21).
- [Preview environments](preview-environments.md): compose-based previews with e2e tests (built, phases 1 to 4).
- [Union settings as a page](union-settings-page.md): Agent settings and GitHub App in the same shell, one page per
  agent, and a Models page. Built (branch `union-settings`).
- [Notifications in Union](notifications.md): an inbox of what needs you (approvals, failures, usage limit, merged
  PRs, finished investigations), with an unread count and optional desktop notifications (built, steps 1 to 5, and the "Notify me in Union" rule action).
- [Group a review's changes by spec](review-spec-groups.md) (built, hunks included): an agent groups the changed files by the parts of
  the spec they implement (PR description, ticket, issue or Notion page), on request; a toggle in the file panel.
- [Token usage of each run](run-token-usage.md): input, cache, output and thinking tokens per agent call and model,
  with turns, peak context and API-equivalent cost, in the Log, the Overview tab and investigations. Built
  (branch `run-token-usage`).
- [Rebase without an agent](rebase-without-agent.md): the host rebases first; the agent runs only on a conflict or
  when the checks fail after a clean rebase, and the final review runs again only when the agent changed code.
  Built (2026-10-17, commit `a0499bd`).
- [Reset a preview](preview-reset.md): drop a preview's containers, volumes (agent services included) and built
  images, and the data folders git ignores the user ticks, then start it fresh; the code is kept. Built, steps 1 to 6.
- [Previews of pull requests under review](review-previews.md): a review's own preview at the reviewed commit
  (`union-r<id>`, `r<id>.localhost`), with its e2e tests and Commands, in a container of its own; no agent, no
  GitHub writes, never the project's secrets for a fork. Built (branch `review-previews`).
- [A size budget for each change](change-budget.md): the technical step estimates the lines of code, the host
  measures the change (tests and generated files left out), and over budget the implementer cuts once and says why
  the rest is needed, shown at the review. Built (branch `change-budget`, 2026-11-06); the review page's header left.
- [Ticket flows](ticket-flows.md): pick the steps a ticket runs (Full, Standard, Quick presets, or custom), so a
  small fix skips planning. Built (branch `ticket-flows`), checked on a real ticket.
- [Custom agents](custom-agents.md): the user describes an agent's role, the worker writes its prompt, the user
  picks its tools and places it in a flow. Built (branch `custom-agents`), steps 1 to 7, checked on real
  runs.
- [Custom review agents](custom-review-agents.md): a custom agent of the Review kind, run on demand on a review
  page in a throwaway checkout, allowed `Bash` to build and test, answering in markdown whose `path:line`
  references open the diff. Built (branch `custom-review-agents`, 2026-11-03), checked on a run with Claude.
- [Notion comments on the ticket](notion-comments.md): a Notion tab lists the page's open discussions (page and
  inline); the user replies or starts one (the worker posts), or adds a discussion to the review for the
  implementer. Decisions confirmed; steps 1 to 5 built (2026-11-05, branch `notion-comments`); the optional step 6 left.
- [Link a review to its Notion page](review-notion-link.md): a pull request under review linked to a Notion page
  gets a Notion tab with the page's text, and Group by spec and Review with agent read that page without its URL
  again. Built, steps 1 to 3 (branch `review-notion-link`); D6 (the page's discussions in the tab) built read only
  with step 5 of Notion comments.
- [Reply to pull request comments](pr-comment-replies.md): Reply on a line thread and Quote reply on a
  conversation comment, from a review's Comments tab and a ticket's PR tab; the worker posts. After a revision on
  imported GitHub comments, the implementer suggests a reply to each, a draft until the user sends it. Built,
  steps 1 to 6 (2026-10-25, spec in `docs/spec/pull-requests.md`), checked on a test pull request.
- [Change the target branch of a ticket](retarget.md): move a finished ticket's own commits onto another branch
  (a fix turned hotfix: `develop` to `main`) with `git rebase --onto`, push and retarget its PR; the agent runs
  only on a conflict or failing checks. Built (branch `retarget`, 2026-10-22).
- [Follow a base branch that was merged](follow-merged-base.md): when GitHub moves a PR onto its base's target
  (the base merged and deleted), the worker takes the new base, and the next Rebase moves only the ticket's own
  commits, even after a squash merge. Built (branch `follow-merged-base`, 2026-10-23).
- [Resync a branch someone else rewrote](resync-branch.md): the poll compares the PR's head with what Union
  pushed, the PR tab flags a move (added commits or a rewrite) and **Resync from GitHub** resets the workspace
  onto it, with no push and no agent. Built (branch `resync-branch`, 2026-11-06).
- [Explain a selection of the diff](review-explain.md): select lines on the review page, an agent explains in a
  side panel how they work and which parts of the specs and repository docs they relate to; follow-ups resume
  its session. Built (branch `review-explain`), steps 1 to 4, checked on a real run.
- [Ticket source integrations](source-integrations.md): Notion's secret, data source, columns and ticket page
  moved to a generic `integrations` table and ticket origin, behind a provider per kind, so Jira or Linear is a
  second implementation. Refactor, built (branch `source-integrations`, 2026-10-24), steps 1 to 6.
- [Jira](jira.md): connect a project to a Jira Cloud project with an API token, import an issue as a ticket (ADF
  converted to markdown, attachments kept as ticket files), from the wizard's Integrations step or the settings.
  Built and deployed (2026-11-07), checked on a real site; rule actions, creating issues and a comments tab built
  since, as their own plans below.
- [Jira rule actions](jira-rule-actions.md): event rules that move the ticket's Jira issue to a status, set its
  fields and comment on it, written by the worker. Built and deployed (2026-11-07), checked on a real site.
- [Jira comments on the ticket](jira-comments.md): a Jira tab on the ticket panel with the issue's comments, New
  comment and Reply (a mention of the author) posted by the worker, and Add to review. Built and deployed
  (2026-11-07), checked on a real site.
- [Create Jira issues from investigations](jira-create-issues.md): "Also create it in Jira" when an investigation
  writes a ticket: the draft's markdown as Jira rich text, the issue type from the settings, the ticket linked to
  the issue. Built and deployed (2026-11-07), checked on a real site.
- [Link a ticket to a Jira issue afterwards](jira-ticket-link.md): **Link a Jira issue** in the Overview for a
  ticket from no tracker, with Change and Unlink, so the Jira tab and rules apply to it. Built and deployed
  (2026-11-07), checked on a real site.
- [Jira issues as review specs](jira-review-specs.md): a `jira` spec kind, read from Jira each time; a Jira ticket's
  specs start with its issue, **Add a spec** takes one. Built and deployed (2026-11-07).
- [Jira issues in reviews of other people's pull requests](jira-pr-reviews.md): issues suggested from the keys a
  pull request names, linked as specs, a review's Jira tab, review rules acting on them. Built and deployed (2026-11-07).
- [More Jira fields in rules](jira-more-fields.md): users, multi-selects and checkboxes, versions, components and
  sprints in **Set fields of the ticket's Jira issue**. Built and deployed (2026-11-07); the editor's lists checked on a real site.
- [The GitHub Project and issues as choices](optional-github-project.md): the GitHub Project becomes an
  optional integration and mirroring tickets as GitHub issues a project setting (on by default), so a team on Jira
  or Notion skips the duplicate issues and board, and the classic-token requirement. Built, steps 1 to 6
  (branch `optional-github-project`, 2026-11-07); a real check against GitHub left.
- [Formatted Jira comments](jira-comment-formatting.md): markdown in the Jira tab's comments through `markdownAdf`,
  rule comments unchanged. Built and deployed (2026-11-07), checked on a real site.
- [Update Union from the sidebar](self-update.md): an Update button enabled when the checkout is behind the remote's
  `main`; the worker fetches `origin` (SSH through the host's `~/.ssh`, read-only), fast-forwards, reinstalls if
  needed, and web and worker exit for compose to start them again; Update anyway when something runs. Built
  (branch `self-update`, 2026-10-21).
- [A spec report on a review](review-report.md): on request, an agent compares the change with the review's specs
  and writes a full report (the important files to read first; each requirement done, partial, missing or
  different, with its code and tests; what the spec did not ask for; risks, questions, docs), in a Report tab.
  Steps 1 to 9 built (2026-10-27, branches `review-report` to `review-report-9`; 7 to 9 make it a triage),
  decisions to confirm.
- [Keyboard shortcuts and the next ticket that needs you](keyboard-shortcuts.md): `?`, `/`, `c` and `n` on the
  board, `n` / `p`, `r` and `1`–`4` on a ticket, `j` / `k` on a review page, and **Next needing you** in the panel
  header. Built (2026-11-04); Approve / Revise keys left out on purpose.
- [Live progress on board cards](card-progress.md): a running card's elapsed time and its agent's last tool call or
  message, polled every 3 s. Built (2026-11-04), seen during a real run.
- [Claude usage meter and a project's Usage tab](usage-meter.md): the subscription's 5-hour and weekly windows in
  the sidebar, read from the agents' `rate_limit_event` lines; a project's API-equivalent cost per week, step,
  model and ticket. Built (2026-11-04); dark mode not looked at.
- [A custom agent image per project](project-agent-image.md): a Dockerfile in the project settings, extending
  `union-agent`, built and checked on **Save and build** and applied only when it passes; tickets, investigations
  and reviews run on it. Built (branch `project-agent-image`, 2026-11-07), the page checked in a browser.
- [Import a pull request as a ticket](pr-import.md): the ticket takes the pull request's branch and waits for
  approval at Implementation; the steps Union wrote on the issue it closes are prefilled, else the Quick flow.
  Built (branch `pr-import`, 2026-11-08); a real run left.
- [A minimal base agent image](agent-image-layers.md): `union-agent-base` (git, the claude CLI as its release
  binary, the node user) and the default `union-agent` built on it with the JavaScript toolchains; a project's
  Dockerfile starts from either, with starters for JavaScript, Python, Rust, Go and PHP. Built (branch
  `agent-image-layers`, 2026-11-07); a real ticket step on the new default image left.
- [Filter the review's files, and Code only](review-file-filter.md): a box that keeps the files whose path holds
  every typed word (`/` goes to it), and Code only, which hides what the change size does not count as code. Built
  (branch `review-file-filter`, 2026-11-09), checked in a browser on a copy of the live database.
- [UI overhaul](ui-overhaul.md): every page redesigned from the Claude Design canvases (cards, ticket tabs, loading
  placeholders, New ticket, the dialogs), then a dark and a light contrast pass over all of them. Built
  (2026-11-12).
