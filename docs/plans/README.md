# Plans and ideas

Features discussed but not built yet. Each file says its status; designs already in `SPEC.md` are summarized there
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
  Risks to revise before building.
- [Stacked PRs in Pull requests and Current reviews](stacked-pr-reviews.md): a stack shows as one item, its review
  page picks a PR in a segmented control, and the agent reviews the whole stack against several specs linked to its
  PRs. Built, steps 1 to 4 (branch `stacked-pr-reviews`); one v1 item left (the size warning).
- [MCP servers for agents](mcp-servers.md): claude.ai connectors built (Figma); HTTP and stdio servers left.
- [Preview environments](preview-environments.md): compose-based previews with e2e tests (built, phases 1 to 4).
- [Project settings as a page](project-settings-page.md): grouped side menu instead of the nine-tab modal (steps 1 to 5 built).
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
  GitHub writes, never the project's secrets for a fork. Planned, not built.
- [Ticket flows](ticket-flows.md): pick the steps a ticket runs (Full, Standard, Quick presets, or custom), so a
  small fix skips planning. Built (branch `ticket-flows`); a real Quick ticket run is left.

## Open items

Loose ends found while building, not planned yet (2026-10-15):

- Ticket 7 (PR #1603) builds on the branch of #1582, which was closed: the user may want to retarget it to the base
  branch (Overview → base branch).
- Project settings as a page: step 6 of [the plan](project-settings-page.md), and the two links left from step 4.
- The check and e2e timeouts stop `docker exec` but leave the command running in the container; the Commands runner
  kills its process group (`container-run.ts`), the gate and e2e should too.
- The web UI on 5173 is reachable from the local network (compose publishes it on all addresses); restrict it to
  `127.0.0.1` if that is not wanted.
- Container commands phase 4: run in a preview service, with its secrets masked ([plan](container-commands.md)).
- The e2e "Send to agent" still builds its own revision text; it could use the command-output path.
- `SPEC.md` is 33 KB: split per area like `AGENTS.md` (`docs/architecture/`).

## Ideas

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
