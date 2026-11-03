# Custom review agents: the user's own agents on the review page

Status: built (2026-11-03, branch `custom-review-agents`), steps 1 to 6; summarized in
`docs/spec/custom-agents.md`. Step 2's checkout checked on real Docker with a stand-in agent, step 5 with a UI
check on a scratch database; no run with Claude yet. Decisions D1 to D6 confirmed
(2026-11-03).

## Why

The review page has fixed agents: Review with agent (draft comments), Group by spec, Explain, and the spec report.
Their prompts can be edited, but their answer formats cannot: the spec report always answers in its JSON block
(`review-report-format.ts`), so a reviewer who wants a different kind of review (a merge-readiness review that runs
the build and the tests, a migration-risk pass, a security pass, an API contract check) cannot get it in the shape
they want. Custom agents (`docs/spec/custom-agents.md`) already let the user describe an agent in a sentence and
get a prompt written for it, but they only run as steps of a ticket's flow; "custom agents as review agents" is
listed there as not built.

This plan lets the user create a **review agent**: a custom agent that runs on demand on a review page (a ticket's
or a pull request's under review), may run commands to check the change, and answers in free markdown whose
`path:line` references open the diff.

## Design in short

- **Create**: Union settings → New agent gets a choice, **Ticket step** (today's custom agent) or **Review**. A
  review agent has a name and a role like any custom agent ("Say whether this PR can be merged: run the build, the
  types, the lint and the tests in a clean checkout, compare it with the ADRs, list the open branches it will
  conflict with"). The prompt writer turns the role into its prompt, told that it is a review agent (D1).
- **Edit**: the same page as a custom agent (role, Regenerate, prompt, model, effort, tools, Delete). Its default
  tools include `Bash` (D2).
- **Run**: on a review page, an **Agents** tab after Report: a picker of the review agents whose prompt is ready
  and **Run agent**, then one card per agent with its newest run on the change (Cancel while it works, its error,
  or its answer; Run again). One tab rather than one per agent: the tab list stays the same whatever ran.
- **What it reads**: the shared and project instructions, the project's lessons for that agent, the review's
  specs (the Specs bar's), the change (`checkedOutChange`, base, changed files, hunk index), the commits'
  messages. The same context the spec report gets, minus the report's format.
- **Where it runs**: always a throwaway container (`union-v<id>`) with the change checked out at the commit the
  review page shows, for a ticket too (D4): it can build and test without touching the ticket's workspace.
- **What it answers**: markdown, shown as is (`Markdown`), with **links to the diff** (D3): every
  `` `path:line` `` or `` `path:start-end` `` (or a bare `` `path` ``) naming a file of the change becomes a link
  that opens the Diff tab on those lines, like the spec report's line chips. **Copy as markdown** copies it.
- **History**: the newest run is shown; it says when the change moved since (head sha), and **Run again**.

## Decisions

- **D1. A review agent is a kind of custom agent, fixed at creation** (confirmed). `custom_agents` gets a `kind`
  (`step` | `review`). A review agent never appears in flow pickers; a step agent never appears in Run agent. The
  kind cannot change afterwards: the tools allowed differ (D2), and a step agent may already sit in flows.
- **D2. Review agents may run `Bash`** (confirmed). They are the only custom agents allowed bare `Bash`; `Edit`,
  `Write` and `NotebookEdit` stay refused (a review changes no file of the change, even if commands leave build
  output). Default tools: `REVIEW_TOOLS` + `Bash`. What makes it safe is the container, not the tool list: a
  throwaway one, no GitHub credentials (the origin is the public URL, like the other PR checkouts), removed after
  the run; nothing it does is pushed or kept.
- **D3. Free markdown, with simple links to the diff in v1** (confirmed). No answer block, no checked fields:
  Union keeps the text. The prompt asks the agent to cite code as `` `path:line` `` or `` `path:start-end` ``
  (the convention `review_explain` already uses). The client turns an inline code span into a link when its path
  is one of the change's files; anything else stays plain code. Line numbers are the new side's. Draft comments,
  attention items and other structure are later items.
- **D4. A ticket's run uses a throwaway clone too** (confirmed). The ticket's container holds the implementer's
  workspace and session; a build or `git checkout` there could leave it different from what the implementer
  left. The worker clones the repository in `union-v<id>`, then brings in the ticket's commits from its container
  (`exportBranch`: a bundle of the branch and its base, whole, copied out through `ContainerRuntime`), clones it on
  the host, keeps both as local branches (the diff base is a branch name, maybe a parent's GitHub does not have),
  checks out the snapshot's head sha and copies the files in with the token-free `origin`.
- **D5. One run at a time per change, any agent** (confirmed): like the spec report (`ReportBusyError`), a second
  Run agent on the same change is refused while one is queued or running. It keeps the run slots and the user's
  Claude usage predictable; per-agent concurrency is a later item.
- **D6. The project's install command runs first** (confirmed): the throwaway checkout has no dependencies, and
  every check the agent would run needs them. The project's files (`syncProjectFiles`) go in first. The worker runs the project's `installCommand` (as the previews do)
  before the agent starts and gives its result in the prompt; a failed install is reported, and the agent still
  runs (it can say what it could not check).

- **D7. A fork's pull request is read, never run** (built with step 2): its install and scripts would run beside
  the container's Claude login. For a review whose `fromFork` is set, the worker copies no project file, skips the
  install, and the prompt tells the agent not to run the change's code.

## Core (`packages/core`)

- `schema-custom-agents.ts`: `kind` column (`step` | `review`, default `step` so existing rows keep their
  meaning). Migration with `bunx drizzle-kit generate`.
- `custom-agents.ts`: create takes the kind; list filters by kind; the D4 delete check of step agents (flows,
  tickets) is skipped for review agents, which are refused while one of their runs is queued or running.
- `custom-agent-config.ts`: a review agent's default tools are `REVIEW_TOOLS` + `Bash`.
- `agent-tools.ts`: `validateTools` takes the kind: `Bash` is refused only for step agents.
- `prompt-writer.ts`: the writer is told the kind. For a review agent: it receives the instructions, the specs,
  the checked-out change and its commits; it may run commands in a throwaway checkout; it changes no file, never
  commits or pushes; it answers in markdown and cites code as `` `path:line` ``; it says which checks it could not
  run and why. One built-in example of house style (`review_report`).
- `schema-review-agent-runs.ts` (new): `review_agent_runs`, with `reviewOwnerColumns`, `runStatusColumn`,
  `agentId` (the custom agent), `specs` (the review's, read by the web when the run is asked, as for reports;
  empty when it has none), `headSha`, `output` (markdown, null until done), `error`, timestamps. Kept apart
  from `review_reports`: it has no specs result or JSON fields to share.
- `review-agent-runs.ts` (new): queue (D5 busy check), claim, finish, fail, cancel, fail the interrupted ones on
  start, newest per owner and agent; each change emits `review_agent_run_changed` (declared in
  `event-payloads.ts`).
- `diff-links.ts` (new, pure, browser-safe): reads `path`, `path:12` and `path:12-30` from an inline code span and
  says whether the path is one of the change's files. Tests in `diff-links.test.ts`.
- Lessons: a review agent's step key (`agent_<id>`) gets lessons like the other agents (`lesson-input.ts`
  already accepts custom steps; check `reportLessonsPrompt`'s counterpart).

## Worker (`apps/worker`)

- `review-agent-checkout.ts` (new): opens the throwaway checkout of D4: a pull request through the existing
  `openTarget` (already a throwaway clone), a ticket through the bundle from its container; returns a
  `ReviewTarget` whose `close` removes `union-v<id>`.
- `review-agent-setup.ts` (new): the project's files and the install (D6), or nothing for a fork (D7).
- `review-agent-prompt.ts` (new): `instructions` (shared + lessons), `resolveAgent(db, agent_<id>).prompt`, the
  specs (`specSections`), `checkedOutChange` (its "do not change any file" stays true: commands may build, not
  edit), the commits, the install result (D6), and a closing paragraph on the link format (D3), always appended by
  the host, so a user's edited prompt cannot drop it (nothing to list in `prompt-formats.ts`).
  `checkedOutChange` says "one git command per call": fine for git, and the agent's other commands are free.
- `review-agent-run.ts` (new): a `RunPool` like `ReviewReportRunner`: claim, open the target, install, run the
  agent with the agent's model, effort and tools, keep its last text as `output`, close. A usage-limit failure
  says so, like the report. `recover` fails interrupted runs and removes their containers.
- `review-runs.ts`: adds the runner to `ReviewRuns` and `reviewRunners`.
- Cancel: a `cancel_review_agent_run` command (`runId`) in `command-cancels.ts`, the hook in `hooks.ts`.

## Web (`apps/web`)

API:

- `POST /api/agents/custom` takes `kind`; `GET /api/agents` returns it.
- `src/routes/review-agent-runs.ts` (new), mounted as `/review-agents` under `/api/tickets/:id` and under
  `/api/projects/:projectId/pull-requests/reviews/:number` (`grouping-targets.ts`): `GET` the ready review agents,
  the newest run per agent on the change (its specs by name, `outdated` once the change moved) and the refusal;
  `POST { agentId }` queues a run with the review's readable specs (`readableSpecs`, shared with the report; none
  needed), 409 when busy or the change cannot be read, 400 when the agent is not a ready review agent;
  `POST /:runId/cancel` queues `cancel_review_agent_run`. The run row is a plain record the web writes (like
  reports); the cancel is a command.

Client:

- `union-settings/new-agent-dialog.tsx` + `agent-kind-field.tsx`: the kind as two cards, with one line each on
  what it does; the intro and the placeholders follow the kind.
- The Union settings menu lists review agents in their own **Review agents** group, after Custom agents
  (`union-nav-groups.ts`); flows offer only step agents (`useFlowAgents`).
- A review agent's page: its description says where it runs and that it may run commands (`agent-labels.ts`); its
  Delete says what deleting keeps (`custom-agent-card.tsx`).
- User guide: `documentation/agents.md` (the two kinds, review agents) and `settings.md` (the menu group).
- `review/review-agents-tab.tsx` (new): the picker and **Run agent**, disabled with the reason while a run works
  or the change cannot be read; **New review agent** (the New agent dialog on the Review kind) when there is none;
  then a `review-agent-run-card.tsx` per agent: its state, the specs it read, whether the change moved since,
  Cancel, Run again, Copy as markdown (`copy-markdown-button.tsx`, shared with the report), and the answer.
- `lib/use-review-agents.ts`, `lib/review-agents-api.ts`: the query (polled while a run works, as the report's) and
  the run and cancel mutations.
- `markdown.tsx`: an optional `renderCode?: (text) => ReactNode | null` for inline code spans (a block's code is left
  alone), so the agent's answer turns a span into a link (`diff-link-code.tsx`: `diffLinkOf` against the diff's
  files, opened with `useOpenLines`) without the other markdown views changing.
- `pr-review-sections.tsx` and `ticket-review.tsx`: the Agents tab after Report.

## Documentation

- `docs/spec/custom-agents.md`: the two kinds; review agents are no longer "not built".
- `docs/architecture/agents.md` (the run, its container, the link format), `worker.md`, `web.md`, maps.
- User guide (`documentation/`): the page on custom agents (creating a review agent) and the page on reviewing (Run
  agent, the tab, the links to the diff).

## Steps

1. Core: `kind` + migration, tool rule by kind, writer prompt for review agents, `review_agent_runs` + its
   module and event, `diff-links.ts`; tests.
2. Worker: the throwaway target (D4, bundle copy checked on real Docker with ticket 9001), install (D6), the
   runner, recovery and cancel. Verify one real run on a pull request and one on ticket 9001: it uses Claude
   usage, ask first; remove the `union-v*` containers and volumes after.
3. Web API: kind on create and list, the runs routes.
4. Web client: the kind in New agent, the agent page.
5. Web client: Run agent menu, the agent's tab, links to the diff in its markdown. UI check with
   `scripts/ui-check/`.
6. Spec, architecture docs, user guide, maps.

## Risks

- **Commands in a throwaway container still cost**: a build and a test suite in a fresh clone take minutes and
  memory, on the run slots the pipeline uses. The tab shows how long the run has gone; Cancel stops it and removes
  the container.
- **The image may lack the project's tools** (turbo, madge, a database for e2e): the agent says which checks it
  could not run; the prompt writer's prompt asks it to. Agent services (databases) for review agents are a later
  item.
- **Network**: `Bash` can reach the network, as the implementer's can. No GitHub credentials are in the container
  (`cloneSource` puts the token on the host clone only, origin reset to the public URL), so it cannot push; it
  can `git fetch` the public repository's branches only if the repository is public. A private repository's
  other branches (the "branches it will conflict with" check) are out of reach in v1: the host could fetch
  them into the clone first, a later item.
- **Links that do not match**: the agent may cite a path outside the change or a wrong line. Outside the change it
  stays plain code; a line past the end opens the file at its end (as `keepInCheckout` cuts report ranges). No
  quote checking in v1.
- **Two places say "do not change any file"** while `Bash` can write: build output and caches. The throwaway
  container makes it harmless; the prompt says "do not edit the change's files" rather than "run nothing".

## Later

- Draft comments from a review agent's findings (the agent review's format, opt-in per agent).
- Agent services (a database) for a review agent's run, from the project's agent services.
- The host fetches the repository's other branches into the clone, for conflict checks on private repositories.
- Several review agents at once on one change.
- Event rules that start a review agent (a pull request put under review, a ticket reaching its review).
