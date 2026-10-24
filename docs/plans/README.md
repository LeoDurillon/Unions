# Plans and ideas

Features discussed but not built yet. Each file says its status; designs already in the spec (`docs/spec/`) are summarized there
and linked.

## Planned in detail

- [Container commands](container-commands.md): run a command or saved script in a ticket's environment, send its
  output to the implementer. Phases 1 to 3 built (running, output, giving it to the agent, saved scripts); the preview service target left.
- [Agent services on localhost](agent-service-ports.md): forward the agent services' published ports to the ticket
  container's `localhost`, choose which variables the agent's commands get, give Commands the same environment.
  Built (branch `agent-service-ports`).
- [CI checks of the pull request](pr-checks.md): list the PR's checks in the ticket's Pull request tab, and give the
  failed ones (log of the failed step, annotations, other jobs' logs, bot comments) to the implementer. Built,
  steps 1 to 5 (branch `pr-checks`).
- [Split a PR into a stack](pr-stack.md): a ticket's PR cut into stacked PRs, one per part of the spec, still one
  ticket; revise, rebase and merge keep the stack in order. Split after the fact first, then slices from the plan.
  Risks resolved; part A built (branch `pr-stack`, 2026-10-20, spec in `docs/spec/pr-stacks.md`), behind a
  project setting; part B (slices from the plan) left.
- [Stacked PRs in Pull requests and Current reviews](stacked-pr-reviews.md): a stack shows as one item, its review
  page picks a PR in a segmented control, and the agent reviews the whole stack against several specs linked to its
  PRs. Built, steps 1 to 4 (branch `stacked-pr-reviews`); one v1 item left (the size warning).
- [Review a split ticket slice by slice](slice-reviews.md): a slice picker on the ticket's review page, comments
  written on a slice's own diff, and the GitHub import pulling every slice's pull request onto its slice. Built (branch `slice-reviews`).
- [Read stacks from GitHub](github-stack-reads.md): the Pull requests and Current reviews tabs, the stack agent
  review and the stack's Notion link take stacks from GitHub's stacks API instead of chaining branches. Built
  (branch `github-stack-reads`, 2026-10-21).
- [MCP servers for agents](mcp-servers.md): claude.ai connectors built (Figma); HTTP and stdio servers left.
- [Preview environments](preview-environments.md): compose-based previews with e2e tests (built, phases 1 to 4).
- [Project settings as a page](project-settings-page.md): grouped side menu instead of the nine-tab modal (steps 1 to 5 built).
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
  Built (2026-10-17).
- [Previews of pull requests under review](review-previews.md): a review's own preview at the reviewed commit
  (`union-r<id>`, `r<id>.localhost`), with its e2e tests and Commands, in a container of its own; no agent, no
  GitHub writes, never the project's secrets for a fork. Built (branch `review-previews`).
- [Spend fewer tokens per ticket](agent-token-savings.md): re-reviews that know the previous round, a size limit
  on the implementer's session, rebase, simplify and the PR description in fresh sessions. Planned (2026-10-17).
- [Ticket flows](ticket-flows.md): pick the steps a ticket runs (Full, Standard, Quick presets, or custom), so a
  small fix skips planning. Built (branch `ticket-flows`); a real Quick ticket run is left.
- [Custom agents](custom-agents.md): the user describes an agent's role, the worker writes its prompt, the user
  picks its tools and places it in a flow. Built (branch `custom-agents`), steps 1 to 7; a run after the
  implementation is left to try.
- [Notion comments on the ticket](notion-comments.md): a Notion tab lists the page's open discussions (page and
  inline); the user replies or starts one (the worker posts), or adds a discussion to the review for the
  implementer. Planned (2026-10-18), decisions to confirm.
- [Link a review to its Notion page](review-notion-link.md): a pull request under review linked to a Notion page
  gets a Notion tab with the page's text, and Group by spec and Review with agent read that page without its URL
  again. Built, steps 1 to 3 (branch `review-notion-link`); D6 waits on Notion comments.
- [Reply to pull request comments](pr-comment-replies.md): Reply on a line thread and Quote reply on a
  conversation comment, from a review's Comments tab and a ticket's PR tab; the worker posts. Planned
  (2026-10-22), decisions to confirm.
- [Change the target branch of a ticket](retarget.md): move a finished ticket's own commits onto another branch
  (a fix turned hotfix: `develop` to `main`) with `git rebase --onto`, push and retarget its PR; the agent runs
  only on a conflict or failing checks. Built (branch `retarget`, 2026-10-22).
- [Follow a base branch that was merged](follow-merged-base.md): when GitHub moves a PR onto its base's target
  (the base merged and deleted), the worker takes the new base, and the next Rebase moves only the ticket's own
  commits, even after a squash merge. Built (branch `follow-merged-base`, 2026-10-23).
- [Explain a selection of the diff](review-explain.md): select lines on the review page, an agent explains in a
  side panel how they work and which parts of the specs and repository docs they relate to; follow-ups resume
  its session. Built (branch `review-explain`), steps 1 to 4; a real run is left.
- [Ticket source integrations](source-integrations.md): Notion's secret, data source, columns and ticket page
  moved to a generic `integrations` table and ticket origin, behind a provider per kind, so Jira or Linear is a
  second implementation. Refactor, built (branch `source-integrations`, 2026-10-24), steps 1 to 6.
- [Update Union from the sidebar](self-update.md): an Update button enabled when the checkout is behind the remote's
  `main`; the worker fetches `origin` (SSH through the host's `~/.ssh`, read-only), fast-forwards, reinstalls if
  needed, and web and worker exit for compose to start them again; Update anyway when something runs. Built
  (branch `self-update`, 2026-10-21).
- [Code quality](code-quality.md): a coverage floor and a check for untested files, tests for the client's hooks,
  import boundaries with dependency-cruiser, mutation testing of the state machine, splitting the files at the
  300-line limit, and smaller checks. Planned (2026-10-23), decisions to confirm.

## Open items

Loose ends found while building, not planned yet (2026-10-15):

- Ticket 7 (PR #1603) builds on the branch of #1582, which was closed: the user may want to retarget it to the base
  branch (Overview → base branch).
- Project settings as a page: the two links left from step 4 ([the plan](project-settings-page.md)); step 6 is
  planned in [Union settings as a page](union-settings-page.md).
- The check and e2e timeouts stop `docker exec` but leave the command running in the container; the Commands runner
  kills its process group (`container-run.ts`), the gate and e2e should too.
- The web UI on 5173 is reachable from the local network (compose publishes it on all addresses); restrict it to
  `127.0.0.1` if that is not wanted.
- Container commands phase 4: run in a preview service, with its secrets masked ([plan](container-commands.md)).
- The e2e "Send to agent" still builds its own revision text; it could use the command-output path.

## Ideas

- [UI/UX review](ui-review.md): quick wins (step 1) built on branch `ui-review`; actions, navigation, board and
  per-page fixes planned.

- [Prefill steps on GitHub issue import](issue-import-prefill.md)
- [Show older merged tickets](board-older-merged.md)
- [Exclude merged PRs from the ticket view](exclude-merged-prs.md) (scope to clarify)
- [Revise with guidance after a failed rebase](rebase-revise-with-guidance.md)
- [Download attachments from GitHub and Notion on import](attachment-downloads.md) (Notion images done)
- [Events v2](events-v2.md): more actions (GitHub comment built; labels, Project fields, Notion comment planned;
  webhook deferred), replay, filters, group triggers
- [Names in the event rule preview](rule-preview-people.md) (small)

## Chores

- [Reword ticket 5's commit e8825f5](reword-ticket-5-commit.md): moot, its pull request was closed.
