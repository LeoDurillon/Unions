# Plans and ideas

Open work only: what is partly built, planned, or an idea. Built plans are kept as history in
[archive/](archive/README.md); the spec (`docs/spec/`) describes what is built.

## Security first

Open findings of the security reviews (2026-10-24 audit, 2026-11-08 review), to take before new features:

- Agent containers hold the full Claude login, refresh token included, with open network access; one container's
  refresh can also retire the others' token. Plan: an optional long-lived token from `claude setup-token`.
- `union.sqlite*` is readable by any local user and holds the integrations' secrets in plain text.
- Tokens appear on command lines (git URLs, `docker exec -e`), visible in the process list.
- Agents can edit `.github/workflows/*`, which CI runs with the repository's secrets.
- A user's own preview compose override keeps `traefik.*` labels.
- Smaller: no container limits (memory, CPU, processes), agent containers share the default bridge network,
  agent base images pinned by tag, Notion downloads follow redirects unchecked, shell-quoted paths in the project
  files helper.

## In progress

- [What the agents' logs say to improve](usage-insights.md): findings on the Usage tab from each call's tokens
  and tool uses (part 1 built), then a Claude run that proposes the changes (part 2 built, branch
  `usage-suggestions`); part 3 (comparing the figures before and after a change) planned.
- [Container commands](container-commands.md): run a command or saved script in a ticket's environment, send its
  output to the implementer. Phases 1 to 3 built (running, output, giving it to the agent, saved scripts); the preview service target left.
- [Split a PR into a stack](pr-stack.md): a ticket's PR cut into stacked PRs, one per part of the spec, still one
  ticket; revise, rebase and merge keep the stack in order. Split after the fact first, then slices from the plan.
  Risks resolved; part A built (branch `pr-stack`, 2026-10-20, spec in `docs/spec/pr-stacks.md`), still behind a
  project setting that is off by default; part B (slices from the plan) left.
- [MCP servers for agents](mcp-servers.md): claude.ai connectors built (Figma); HTTP and stdio servers left.
- [Project settings as a page](project-settings-page.md): grouped side menu instead of the nine-tab modal (steps 1 to 5
  built; step 6 built as [Union settings as a page](archive/union-settings-page.md)); two links from step 4 left.
- [Spend fewer tokens per ticket](agent-token-savings.md): re-reviews that know the previous round, a size limit
  on the implementer's session, rebase, simplify and the PR description in fresh sessions. Step 1 built
  (2026-10-17, commit `7ab1d85`); steps 2 to 5 planned.
- [Lessons on the right step, without repeats](lesson-quality.md): the lesson writer told what each step decides
  and where a lesson goes, proposals that replace kept lessons (ids kept on save), and a Tidy lessons agent. Built,
  steps 1 to 3 (2026-11-06); step 4 (checks on the Memory page that cost no Claude usage) planned.
- [Getting started, help menu and the guide in the app](getting-started.md): a checklist on the board that ticks
  itself, a Help menu in the sidebar, the user guide served by Union, then maybe a tour. Steps 1 to 3
  built (2026-11-07, branch `onboarding-help`); Learn more on every
  settings page; the tour left.
- [A project's Repository tab](repository-view.md): the whole repository at a branch or commit, read from GitHub:
  a folder tree with a path filter, files highlighted with line links, Markdown and images rendered; links in from
  the review page. Steps 1 and 2 built (2026-11-05, branch `repository-view`), and most of step 3 (the branch
  picker, Markdown, images); left: folder READMEs, line selection and Copy link (step 3), the links in (step 4),
  search (step 5).

- [Services shared between previews](shared-services.md): utility services (ClamAV, Mailhog, then S3 and
  Postgres with a tenant per preview) run once per project and joined to each preview's network. Phases 1,
  1b and 2 built (2026-11-10); drift warnings left.

- [A setup agent at the end of the wizard](setup-agent.md): the wizard's last step offers an agent that reads the
  repository and proposes the checks, preview, e2e command, saved scripts, instructions and agent image; the worker
  checks them without Claude, the user applies them card by card, and repository changes become tickets. Steps 1
  and 2 built (2026-11-10, branch `setup-agent`: the wizard's choice, the run with Union's guide, the proposal
  reviewed and applied card by card); steps 3 (checks without Claude) and 4 (Run setup from Settings) planned.

## Planned

- [Agent reviews of large changes, slice by slice](sliced-agent-review.md): the agent review given the change's
  file list and hunk index, then, above a size threshold, one agent per slice of a grouping by spec (or by folder
  without specs), a pass on the seams between slices, and the drafts merged. Step 0 done; step 1 (the file list,
  one file per diff, and what the agent never opened shown on the page) built 2026-11-13, its rerun left.
- [One adapter per tracker](tracker-adapters.md): what Notion and Jira do (comments, statuses, fields, links,
  specs, reviews, files) behind one `TrackerAdapter` with capabilities, shared field types and rule actions, one
  contract test suite and an ast-grep guard, so a new tracker is an adapter and its settings. Planned (2026-11-07),
  updated 2026-11-13: step 3 now also takes over tracker properties. Steps 1 and 2 built (2026-11-13,
  branch `tracker-adapters`).
- [Code quality](code-quality.md): a coverage floor and a check for untested files, tests for the client's hooks,
  import boundaries with dependency-cruiser, mutation testing of the state machine, splitting the files at the
  300-line limit, and smaller checks. Planned (2026-10-23), decisions to confirm.

## Loose ends

Loose ends found while building, not planned yet (2026-10-15):

- Ticket 7 (PR #1603) builds on the branch of #1582, which was closed: the user may want to retarget it to the base
  branch (Overview → base branch).
- Project settings as a page: the two links left from step 4 ([the plan](project-settings-page.md)); step 6 is
  built as [Union settings as a page](archive/union-settings-page.md).
- The check and e2e timeouts stop `docker exec` but leave the command running in the container; the Commands runner
  kills its process group (`container-run.ts`), the gate and e2e should too.
- Container commands phase 4: run in a preview service, with its secrets masked ([plan](container-commands.md)).
- The e2e "Send to agent" still builds its own revision text; it could use the command-output path.
- Built plans with a small item left (in [archive/](archive/README.md)): the stack size warning
  (stacked-pr-reviews), two items of the UI review's step 5 (ui-review), the optional trigger for new Notion
  comments (notion-comments), a real run of a pull request import (pr-import), and a real ticket step on the new
  default agent image (agent-image-layers).

## Ideas

- [Show older merged tickets](board-older-merged.md)
- [Exclude merged PRs from the ticket view](exclude-merged-prs.md) (scope to clarify)
- [Revise with guidance after a failed rebase](rebase-revise-with-guidance.md)
- [Download attachments from GitHub and Notion on import](attachment-downloads.md) (Notion and Jira files done, GitHub left)
- [Events v2](events-v2.md): more actions (GitHub comment, pull request labels and GitHub Project fields built;
  Notion comment planned; webhook deferred), replay, filters, group triggers
- [Names in the event rule preview](rule-preview-people.md) (small)
- From the [UI overhaul](archive/ui-overhaul.md)'s canvases, new features to ask about first (they use Claude or
  start work): "Draft with the agent" on a Notion comment, "Start it now" in New ticket, "Bring the page's changes
  in" on the Notion tab, Stop on a running step in the Log (a state machine change). Also open: naming the Notion
  status column in Settings → Notion, and per-service preview state (a migration).
