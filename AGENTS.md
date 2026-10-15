# AGENTS.md

union-next: a local Kanban over a GitHub Project. Moving a ticket to In Progress spawns a Docker container that runs
an agent pipeline on the project's repo with the user's Claude Max subscription. Read `SPEC.md` before changing
behavior; this file covers how to work in the repo.

## Layout

- `packages/core`: shared code. `agents.ts` holds the default agent prompts and models; edits made in the UI's
  Agent settings are stored in `agent_configs` (overrides only, Reset deletes the row) and the worker resolves them
  on every run (`resolveAgent`, `modelFor`, `effortFor`, `toolsFor`; the effort becomes `claude --effort`, unset
  leaves the CLI's default). Change a default there, not in the worker. Ticket agents
  get `sharedPrompt` first: the shared instructions, then the project's own (`config.instructions`, project
  settings → Instructions; investigations get those too, via `projectInstructions`).
  `agent-tools.ts` holds each step's default allowed tools and the tool list agents pick from (Claude Code's tools,
  the rules the defaults use, the account's claude.ai connectors from `mcp-connectors.ts`, and the user's additions
  in `agent_tools`). A run loads the connectors only when its tools include one (`connectorEnv` in the worker's
  `agent.ts`); the worker's `ConnectorChecker` (`mcp-check.ts`) reads them on request. Denied rules (`BASE_DENIED`,
  `IMPLEMENT_DENIED` in the worker) are not editable and always win over a selected tool.
  `investigations.ts`: one-off agent runs on a custom prompt (records, claim, finish, cancel, follow-ups); defaults
  in the browser-safe `investigation-defaults.ts`.
  Drizzle schema and migrations, the pure ticket state machine (`states.ts`), ticket dependencies
  (`ticket-links.ts`: `setParent`, `ticketBase`; the start gate `blockingParent` is in `tickets.ts`), the
  `ContainerRuntime` interface and its Docker CLI implementation.
- `apps/web`: Hono API and React/Vite SPA, served by one Bun process in production.
  - `src/app.ts` is `createApp(db)`; routes live in `src/routes/` (`projects`, `tickets`, `events`); `src/server.ts`
    only wires the DB and `Bun.serve`. `src/api-types.ts` holds the response shapes shared with the client.
  - Setup is a wizard (`components/onboarding/`: Connect, Repository, Project, Notion, Review) shown over the board
    on first run and from "Add project". Connect takes a token or an installation of the GitHub App
    (`components/github-app/`, also a global page in the sidebar). The board columns fill the viewport height; each column scrolls itself.
    A ticket whose PR is merged or closed (`pr_state`, polled by the worker) is in the Union-only Merged / Closed column
    (`boardColumn`), its card tagged Merged or Closed, for 21 days after `pr_merged_at` or `pr_closed_at`, then leaves the
    board (`leftBoard`); the GitHub Project still sees it as Done. A closed PR is still polled: reopened, the ticket goes back.
  - Code review: after each implementation run the worker stores the branch diff (`diff-snapshot.ts`,
    `diff_snapshots`/`diff_files`, newest only). The web reads it from SQLite (`routes/review.ts`), never from Docker or
    GitHub; `components/review/` renders one file at a time, unified or split (`lib/split-rows.ts` pairs the lines),
    highlighted by lowlight per hunk side (`lib/highlight.ts`). Line comments are drafts in `review_comments` until
    sent; sending formats them (`review-feedback.ts`) into a normal `revise` command. The ticket panel's PR tab
    (`pull-request-tab.tsx`, `pull-request/`) shows the linked PR's discussion (`OnboardingGitHub.getDiscussion`,
    `github-discussion.ts`); `routes/review-import.ts` and `review-import.ts` import threads (line drafts) and single
    review summaries or comments (`general` drafts). A pull request under review (Current reviews tab) uses the same
    page and comment code: `review_comments` rows belong to a ticket or to a `current_reviews` row
    (`routes/review-comments.ts`, `routes/pr-review.ts`), and the client reviews a `ReviewTarget`
    (`lib/review-target.ts`), whose base URL serves the diff, the comments and the send. Files matching the project's
    review ignore rules (`isIgnoredPath` in `@union/core/diff`: built-in lock files plus `config.reviewIgnore`
    gitignore-style patterns) are flagged `ignored` and listed apart, never dropped. `@union/core/diff` parses diffs and
    is browser-safe. A pull request's review can show one commit at a time (`commit-picker.tsx`, `commit-diff.tsx`,
    `routes/pr-commits.ts`: the PR's commits and a commit's files against its first parent, read from GitHub and kept
    by SHA in memory); that view is read only, comments are written on all the changes. A ticket's review has the same
    view from SQLite: `captureDiff` also keeps each commit of `base..HEAD` with its own files (`diff-commits.ts`,
    `diff_commits`/`diff_commit_files`, newest 100) and, once the user has sent a review (`tickets.reviewed_sha`, the
    snapshot's head then), the change since that head while it is still in the branch (`routes/ticket-commits.ts`,
    `since-review`).
  - Project settings are a page, not a modal: `?settings=<section>` (`lib/settings-sections.ts` lists the sections
    and their groups; `openSettings(section)` links to one from anywhere), `components/settings/settings-page.tsx`
    with a grouped side menu.
  - Event rules (project settings → Event rules, `routes/event-rules.ts`): when something happens to a ticket, set a
    property of the Notion page it was imported from (`tickets.notion_page_id`, set by the import; older imports are
    linked from their "Imported from Notion:" line by `backfillNotionPages` at worker start). Rules point at
    properties by id in the stored copy of the data source's columns (`notion_data_sources`, read again on connect
    or "Refresh from Notion") and are checked against it on save. Triggers, variables and Notion value shapes are in
    the browser-safe `@union/core/event-rules`; matching and the delivery queue in `event-rules.ts` and
    `event-deliveries.ts`. Rules apply only to events logged after their creation (no replay).
  - Agent review comments: "Review with agent" on either review page queues an `agent_reviews` row
    (`routes/agent-review.ts`, `@union/core` `agent-reviews.ts`). Its findings become drafts with `author: 'agent'`
    (badge "suggested", Keep button); keeping or editing one makes it the user's (`author: 'user'`), and a new
    successful run replaces only the agent's untouched drafts. Nothing is sent: the drafts go out with the usual
    send. Its prompt and model are the `review_comments` agent in Agent settings; `final_review` is unrelated.
  - Grouping by spec: "Group by spec" on either review page (`group-by-spec-dialog.tsx`) reads a specification
    (`routes/spec-sources.ts`: the PR description without Union's links, the ticket's text, a GitHub issue, any
    Notion page the integration can read), lets the user edit it, and queues a `review_groupings` row
    (`routes/review-groupings.ts`, `grouping-targets.ts`; `@union/core` `review-groupings.ts`). The worker's
    `ReviewGroupingRunner` (`review-grouping.ts`, same slots and checkout as the agent review, PR containers
    `union-g<id>`) runs the `review_groups` agent; `review-grouping-result.ts` keeps only changed files, puts the ones
    left out under "not in the spec" and empty groups under "missing". Groups place hunks: the host writes the diff's
    hunks to `.git/union-review-hunks.md` in the checkout (`review-grouping-format.ts`), the agent names whole files
    or hunks by their new-side start line, and the parser maps each line to the stored hunk around it (`hunkAt` in
    the browser-safe `@union/core/diff-hunks`; keys like `-12+14`), so `SpecGroup.hunks` lists the files a part takes
    only in part and every hunk is placed at least once. Only the newest grouping is kept; it is outdated when the
    review's head commit moved. The file panel's "By spec" toggle (`spec-groups.tsx`, independent of List/Tree) shows
    the files under their groups; a file opened under a part shows only that part's hunks (`hunk-focus.tsx`,
    `lib/spec-hunks.ts`, "Show all" to see the rest) with each hunk header tagged with its parts, except on an
    outdated grouping.
  - Previews: project settings → Preview (`routes/preview-settings.ts`, `config.preview`: compose file, service,
    port, plain variables) and the ticket Overview's Preview section (`preview-section.tsx`, `routes/preview.ts`,
    state in the `previews` table). Start, stop and logs are commands; the worker owns Docker.
  - PR description rewrite: the PR tab's Description section (`pull-request/pr-description.tsx`,
    `routes/pr-description.ts`, `@union/core` `pr-descriptions.ts`) queues a `pr_descriptions` row. The agent's draft
    is the user's to edit, send or discard; sending is the `update_pr_description` command. "Outdated" means a
    `branch_pushed` event came after the last `pull_request_opened` or `pr_description_sent`. Union's links ("Closes
    #n", the PR it builds on) are never part of the draft: `withoutUnionLinks` strips them, `pullRequestBody` adds them
    back.
  - `client/` is the SPA: Tailwind v4, TanStack Query, dnd-kit. `app.tsx` is the shell, `components/` the UI,
    `lib/` the hooks and the typed `api.ts`. The browser keeps one event stream for all its Union tabs
    (`lib/event-hub.ts`: the tab holding the Web Lock `union-events` reads `/api/events` and relays each event
    over a BroadcastChannel; browsers allow six connections per host, and a stream per tab or log used to leave
    clicks waiting). The board and ticket panel refetch on its events (`use-live-invalidation.ts`); the Log tabs
    load `/api/events/history` once, then follow the stream. Events are sent unnamed: a new event type reaches
    the client without being listed.
  - Dev: `bun run dev:web` (Vite on 5173 proxies `/api` to Hono on 3000). Production: build, then start (below).
- `apps/worker`: long-running Bun process. Drains the `commands` table, drives state machines, runs agents,
  syncs GitHub, writes `events`.
  - `commands.ts` maps UI commands to state-machine actions; `scheduler.ts` runs one step per ticket with a
    concurrency cap through an injected `StepExecutor`; `executor.ts` is the real one (planning, implement, review
    and rebase steps).
  - `implement.ts` / `implement-loop.ts`: the implementation step. The host checks out the ticket branch
    (`branch.ts`, `workspace-git.ts`), runs the project's install command, then loops agent turn → leftover commit →
    check command (`gate.ts`), resuming the same session with the failure until green or `maxIterations`.
    `publish.ts` exports the branch as a git bundle, pushes it from the host with the project token and opens the
    draft PR, described by the implementer from the repository's PR template (`pr-description.ts`). The agent may
    run shell commands but never push, switch branches or rewrite history.
  - `rebase.ts` (with `rebase-agent.ts`, `rebase-fetch.ts`, `rebase-git.ts`, `rebase-publish.ts`): the on-demand
    rebase step. The host fetches base and branch into the container as a bundle, resumes the implementer's session
    with the rebase prompt, checks the result and the project's checks, then force-pushes with a lease; any failure
    puts the branch back as it was. `github/pull-request.ts` keeps `tickets.behind_by` current during the pull.
  - `investigate.ts`: `InvestigationRunner` runs queued investigations in throwaway `union-i<id>` containers
    (removed after each run; a `ticket` investigation runs in the ticket's own container instead, `investigate-ticket.ts`:
    never during a step, writing tools always denied, `git status` and HEAD compared before and after, the container
    stopped after unless a step started; the ticket panel's Investigate opens the form with `?investigate=<id>`), sharing the scheduler's `RunSlots` (`slots.ts`); cancellation arrives through the
    `cancel_investigation` command hook. It also drives `TicketDrafter` (`investigation-ticket.ts`), which writes
    the tickets asked from investigations, in `union-i<id>-ticket` containers.
  - `event-dispatcher.ts`: follows the `events` log (cursor in `event_cursors`), queues one `event_deliveries` row
    per matching rule and event (unique), and writes to Notion a few per tick, one at a time. Rate limits, 5xx and
    network errors are retried with backoff up to 5 attempts; each outcome is logged as `event_rule_applied` (the
    ticket's Log tab). `github/pull-request.ts` logs `pull_request_merged`/`pull_request_closed`, and linking a PR by
    hand logs `pull_request_linked`, for the rules.
  - `agent-review.ts`: `AgentReviewRunner` (started with the investigations in `side-runs.ts`, same slots) runs
    queued agent reviews: a ticket's in its own container on its branch (`agent-review-target.ts`), a pull request's
    in a throwaway `union-a<id>` container where the host cloned it at the reviewed commit (`pr-checkout.ts`, through
    `pull/<n>/head`, so forks work). The agent ends its answer with a JSON block (`agent-review-findings.ts`, format
    appended by the host); findings outside the diff's lines become `general` drafts naming the place, so nothing is
    lost. Cancellation goes through the `cancel_agent_review` command hook.
  - `pr-description-run.ts`: `PrDescriptionRunner` (same slots) rewrites a PR's description in the ticket's
    container, resuming the implementer's session (`runResumable`), from GitHub's current description, the PR template
    and the branch. `github/pr-description-send.ts` writes the user's version only if GitHub's description is still
    the one the agent read (else `conflict`), so an edit made on GitHub is never overwritten unseen. The first
    description (`pr-description.ts`, when the PR is opened) and the rewrite both use the `pr_description` agent.
  - `preview/`: ticket previews (phase 1 of `docs/plans/preview-environments.md`). `PreviewManager` runs the
    `preview_start`/`preview_stop`/`preview_logs` commands, one at a time per ticket. Every `docker compose` call runs
    in a throwaway helper container (`runtime.runHelper`, `docker:*-cli` image) holding the Docker socket and the
    ticket's workspace volume; the agent's container never holds the socket. The repository's compose file is
    resolved (`compose config --format json`), checked (`composeProblems` in `@union/core`: no privileged or
    host-namespace settings, no mounts or builds outside `/workspace/repo`, no external volumes or networks), and
    rewritten (`previewCompose`: project `union-t<id>`, no `container_name` or host ports, repository mounts become
    workspace-volume sub-path mounts, project variables in every service, Traefik labels on the exposed service),
    then given to `up` on stdin. The `proxy` service of `compose.yaml` (Traefik, network `union-preview`) serves it at
    `http://<id>.localhost:8080`. Previews outlive worker restarts; a ticket's removal takes its preview down before
    its volumes (`janitor.ts`). `compose-file.ts` keeps the generated file (`previews.compose_yaml`, `preview_generate`
    generates it alone) and runs the ticket's own edited file instead when there is one (`previews.override`, checked
    with `composeProblems(file, { workspaceVolume })`, project name enforced). Profiles: `catalog.ts` passes the
    settings' `--profile`s, reads every profile and service (`--profile '*'`, kept as `previews.compose_catalog`),
    and `profiles:` is dropped from the file that runs. Compose additions (`config.preview.composeAdditions`, YAML in the settings): written in the helper at `/union/compose.additions.yml` and given as a second `-f` whenever the repository's file is read (`composeFileArgs` in `catalog.ts`), so the merged file is what gets checked and rewritten; never written to the workspace. Variables: `target.ts` fills in the
    settings' templates (`@union/core/preview`) and reads the secrets (`preview_secrets`, worker only);
    `variables.ts` writes them to Union's env file (`/union/preview.env`, written in the compose helper through
    `HelperSpec.files`, never in the workspace), which every service reads (`env_file`); the file kept for the panel
    lists them in a comment and shows secrets interpolated by the repository's file as `${NAME}`, never a value. `network.ts` puts the ticket's container on its preview's networks
    (after a start, on provisioning) and takes it off before `down`.
  - `agent-services-step.ts` and `preview/background.ts`: the services a project starts for the agent
    (`config.preview.agentServices`, a database for its tests). Around implementation and rebase steps the worker
    runs `up -d <services>` in the ticket's compose project (shared with the preview), joins the ticket's container to
    it, gives every command run in that container the plain variables (`withEnvironment`, never the secrets), and
    `stop`s the services after the step (data kept) unless the preview runs. A preview stopped during such a step
    removes only the services the proxy serves.
  - `preview/idle.ts`: stops running previews nobody visited for the project's `idleStopMinutes` (60 by default),
    from Traefik's per-router request counts (`UNION_PREVIEW_METRICS`, an entrypoint only the worker reaches); never
    while the ticket is in a step or its e2e tests run. The proxy publishes its port on `127.0.0.1` only.
  - `e2e.ts`: the end-to-end tests (`config.preview.e2eCommand`), run only when the user asks (`preview_e2e`, one at a
    time across tickets in `PreviewManager`; never from the implementation loop, which runs the checks only): starts
    the ticket's container and preview, installs the browser at the repository's Playwright version, runs the command
    with `BASE_URL`, keeps the result on the preview (`previews.e2e_*`) and up to 5 failure screenshots as private
    ticket files (`replaceE2eScreenshots`). The panel sends a failure to the agent as a normal revision.
  - `container-run.ts`: commands the user runs in a ticket's workspace (Preview tab → Commands, `container_runs`,
    `routes/container-runs.ts`). Refused during a step and while another runs on the ticket; up to 3 across tickets.
    Runs `setsid -w sh -c` in the checkout as `node` (with `PREVIEW_URL`/`BASE_URL` while the preview runs), keeps
    the last 500 lines (64 KB, colours stripped) and writes them once a second. Stopping `docker exec` does not stop
    the command, so a cancel or a timeout kills its process group (id in `/tmp/union-run-<id>.pid`); the container
    stops after unless a step started. A finished run's output can go to the implementer (`for_agent`): kept for its
    next run, or sent now (`sendToAgent`: a `revise` command with the user's note, only when the revision goes back to
    the implementer). `implementLoop` adds the pending outputs to the first turn's prompt (`commandOutputPrompt`, 5
    newest, fenced so their backticks cannot close the block) and marks them `sent` once that turn ran. Saved scripts
    (`config.scripts`, checked by core `parseScripts`) run by name: the route resolves `{ scriptName }` with
    `scriptRun`, and the run stores the command as it was and `script_name`.
  - `review.ts`: the final review (fresh session, read-only tools plus git reads, one git command per call because
    permission rules cannot match `&&`). Changes asked at the review go to the implementer through the `thenRun`
    chain in `states.ts`; `revision.ts` hands it the review's feedback. `runResumable` (agent.ts) restarts in a fresh
    session when a resumed one is gone (rebuilt HOME volume).
  - `provision.ts` creates a ticket's container, seeds credentials, and clones the repo on the host with the
    project's token, resetting `origin` to the token-free URL before copying it in; `agent.ts` runs
    `claude -p` in it and parses stream-json; `prompts.ts` builds the step prompts.
  - Ticket attachments: the web stores uploads under `attachments/t<ticket>/` (gitignored, `UNION_ATTACHMENTS_DIR`
    overrides; rows in `ticket_attachments`, `routes/attachments.ts`). Before every step `attachments-sync.ts`
    replaces `/workspace/attachments` in the container (outside the repo) with the ticket's current files, and
    `prompts.ts` lists them for every step but the rebase. `pushBranch` refuses a branch whose history holds a
    file not allowed in the repository (matched by git blob id, `PrivateFilesError`).
  - Project files (project settings → Files, `routes/project-files.ts`, `project_files`): uploads streamed to
    `attachments/p<project>/<id>` (up to `UNION_MAX_PROJECT_FILE_MB`, 2048 by default), never readable from the
    browser. `project-files-sync.ts` puts them at their paths in the ticket's repository on provisioning (every step)
    and before each preview start, through a compose helper on the workspace volume (`copyIntoVolume`); unchanged
    files (sha256) are left alone, removed ones deleted, and every path goes in `.git/info/exclude`. Pushes refuse
    them like private attachments (`privatePushFiles`), and `prompts.ts` lists them for the agents.
  - Leftover commits always carry the agent's own message, never one of Union's: taken from the report's
    `Refused commit: …` line, else asked for in one more turn of the agent's session (which may commit them
    itself); no message fails the run.
  - Refused commits: when the repository's hook refuses the leftover commit (`leftovers.ts`; told apart from other
    failures by a `--no-verify --dry-run`), the implement or rebase run stops in the `commit_refused` phase with the
    agent's report, and `refused-commit.ts` records the files, hook output, diff and its hash in `refused_commits`.
    The user commits them without hooks (`commit_anyway`), sets them aside in a stash (`drop_leftovers`), or sends
    the implementer back (`revise`); the run then resumes (`phase.resume`) without the agent, and asks again if the
    diff changed. A paused rebase keeps its rebased branch and push lease (`resumeState`).
  - `github/`: `api.ts` is the narrow `GitHubApi` the worker depends on, `octokit-api.ts` the real client,
    `fake-api.ts` the in-memory one for tests, `sync.ts` the mirror (issue, Status field, one comment per step,
    pull of title/description and "move to In Progress"; `dependency.ts` pushes a ticket's parent as "blocked by"), `queries.ts` the GraphQL. `clients.ts` builds each
    project's API from its credentials (`projectGitHubAuth`); projects without any fall back to `GITHUB_TOKEN`, else
    their sync is off. GraphQL changes must be validated
    against GitHub's schema, and new sync behavior needs a test against the fake.
- `docker/agent.Dockerfile`: the agent image (`union-agent:local`, build with
  `docker build -t union-agent:local -f docker/agent.Dockerfile docker`).

## Commands

- `bun install`
- `bun test`: runs all tests.
- `bun run check`: format check, lint, typecheck and tests. Run it before finishing; it must pass.
- `bun run lint` (`lint:fix` to autofix), `bun run fmt` (`fmt:check` to verify), `bun run typecheck`.
- `bun run dev`: web (Vite on 5173 + API on 3000) and worker together, with reload. `bun run dev:web` /
  `bun run dev:worker` run one side.
- `bun run compose` (`docker compose up --build`; `compose:down` stops it, `compose:logs` follows the logs): the same dev stack in containers, on
  http://localhost:5173. See the header of `compose.yaml` for the overrides (`DOCKER_GID`, `UNION_UID`, ports). The
  worker uses the host Docker socket; agent containers run beside the stack, not inside it.
- `bun run start`: builds the client, then runs the production web server (port 3000) and the worker together.
- `bun run db:backup [file]`: consistent copy of the database (`VACUUM INTO`, safe while running) into
  `backups/` (gitignored). `bun run db:restore <file> [--force]`: refuses while web or worker has the database open
  (host processes or compose services), saves the current database to `backups/union-before-restore-*`, then
  rebuilds the target from the backup (never a plain file copy: in WAL mode recent data lives in `-wal`).
- `bun run db:reset --yes`: empty database with every migration applied. Without `--yes` it only prints what would go.
  Same in-use refusal as restore, backup to `backups/union-before-reset-*` first, and it removes the agent
  containers and volumes of the deleted tickets (ticket ids restart at 1, so `union-t1` would otherwise be reused).
  GitHub and Notion are not touched.
- After editing `packages/core/src/schema.ts`: `cd packages/core && bunx drizzle-kit generate`. Commit the migration.
  The running web and worker reload on schema changes and apply new migrations to `union.sqlite` at once, so never
  regenerate or rewrite a migration once a dev server has run it: add a new one instead.

Both apply migrations at start (`migrateDb`). It replaces drizzle's migrator, which reads what is applied before
locking and let web and worker apply the same migration when they started together: `migrateDb` takes the write
lock first (`BEGIN IMMEDIATE`), so the second process waits and finds nothing left (`db.test.ts` races four).

Web and worker must open the same SQLite file. The default is `union.sqlite` at the repository root (an absolute
path computed in `packages/core/src/db.ts`), whatever directory a process starts from; `DB_PATH` overrides it for
both.

## Rules

- Bun and TypeScript only. Use `bun`, `bun test`, `bun:sqlite`, `Bun.sleep`. No Node-only tooling, no `ts-node`.
- Every dependency version lives in the root `package.json` under `catalogs`, grouped by usage (`development`, `ui`,
  `server`, `database`; add `test` etc. when needed). Workspace `package.json` files only reference them as
  `"catalog:<name>"`. Add dependencies with `bun add --catalog=<name> <pkg>` from the workspace that uses it, then
  check the root catalog got the entry and the workspace uses `catalog:<name>`. A package belongs to exactly one
  catalog.
- Catalog versions are exact: no `latest`, `^` or `~`. `bunfig.toml` sets `exact = true`. Only `workspace:*` is
  allowed besides `catalog:` references.
- The web app never runs agents or touches Docker or GitHub. Anything that drives the state machine (start,
  approve, revise, retry, cancel) is a row in `commands`, handled by the worker. The web may write plain records
  directly: creating projects and tickets, and saving an edited step output. It reads state from SQLite and
  streams `events` over SSE.
- All GitHub writes for tickets (issues, comments, Project status, push, PR) happen in the worker. Containers never
  hold GitHub credentials. The only GitHub calls the web server makes are the ones the UI needs answered right away:
  the setup wizard (verify the token, list repositories and Projects, create a Project), checking and listing the
  GitHub App's installations (`/api/github/app`), looking up a pull request a user links to a ticket, reading an
  issue to create a ticket on it (`routes/issue-import.ts`), reading a linked pull request's discussion (PR tab,
  review import), a reviewed pull request's files and commits, and listing the repository's pull requests (project bar → Pull requests,
  `routes/pull-requests.ts`; the Current reviews tab's records are local, under `/pull-requests/reviews`,
  `routes/current-reviews.ts`), all read only (`src/github-onboarding.ts`, behind the `OnboardingGitHub` interface
  so tests use a fake). Posting a pull request review is a write: it goes through the `submit_pr_review` command
  and the worker (`github/pr-review.ts`).
- Notion (read only, from the web server): verifying a project's integration secret and data source, and importing
  a page of that data source as a ticket (`src/notion.ts` behind `NotionApi`, `routes/notion.ts`). Uses API version
  `2026-03-11` and `GET /v1/pages/{id}/markdown`. The secret is stored in `projects.notion_token` and never sent to
  the browser (`hasNotion` only). Pages outside the configured data source are refused. The page's markdown is cleaned at import (`notionMarkdown` in the browser-safe `@union/core/notion-markdown`: mentions become links titled from Notion, callouts quotes, comment and color spans their text, toggle children are dedented); the ticket panel cleans older imports as it shows them. Creating a ticket from a page downloads its images (Notion's signed links expire within the hour; only Notion's file hosts, raster images, within the attachment limits) into private ticket files referenced as `attachment:<name>`, which the panel shows inline (`?inline`, raster images only).
- A project reaches GitHub with a token (`projects.github_token`) or an installation of the GitHub App
  (`projects.github_installation_id`; the app's ID and private key are one row of `github_app`). Both are stored in
  plain text (local single-user app, like the original Union) and never reach the browser: responses use
  `PublicProject` / `toPublicProject` (`githubAccess` only) and the app status omits the key. Resolve credentials
  with `projectGitHubAuth` (`@union/core`; installation wins, then token, then `GITHUB_TOKEN`) and build clients
  with `@union/core/github-client`: clients are cached per credential so an installation token is minted once an
  hour, and git gets a fresh token (`gitToken`) right before each clone or push. Every request is bounded
  (`timeoutMs`, `retries`: 30 s per attempt; the web server 20 s and one retry): Octokit queues token minting and
  GraphQL per process, so one stuck request used to block every later call until a restart. Never build an Octokit
  from a project's token by hand.
- A ticket's base branch is `ticketBase(project, ticket)`: the parent's branch it was cloned from, else the project's.
  Never use `project.config.baseBranch` directly in the worker. Starting goes through `dispatch`, which refuses a
  ticket whose parent is not done; check `blockingParent` before queueing or honouring a start anywhere else.
- Keep `states.ts` pure: no I/O, no clock, no DB. The worker persists whatever `transition` returns. New phases
  or actions need a test in `states.test.ts`.
- Reach Docker only through `ContainerRuntime`. Do not call `docker` from anywhere else.
- Never mount a ticket's HOME volume read-only: `claude --resume` needs to write session files there. Seed only the
  `claudeAiOauth` credential. Never copy `mcpOAuth` or history into a container.
- SSE handlers use Hono's `streamSSE` and loop on `!stream.aborted`. Event ids are `events.seq`, so resume works
  through `Last-Event-ID`. Keep `idleTimeout: 0` on `Bun.serve`.
- `events` is append-only. Do not update or delete rows.
- Memory (feedback and lessons) lives in the database, per project. Do not reintroduce markdown inbox files.
- Lint and format are strict and enforced by `bun run check`: oxlint (type-aware, `--deny-warnings`) and oxfmt
  (single quotes, 100 columns, sorted imports). Config is in `.oxlintrc.json` and `.oxfmtrc.json`. Fix the code, not
  the rule. Do not add `oxlint-disable` comments or loosen the config without a stated reason.
- Style the linter enforces: explicit return types, no `any`, no non-null assertions, type guards instead of unsafe
  assertions, `import type` for types, exhaustive `switch` (use `assertNever`), no floating promises, braces on every
  `if`, no `console` (except the worker entry), no magic numbers (use named constants), max complexity 12, max
  function length 60 lines, max file length 300 lines, kebab-case filenames.
- Write comments only where the reason is not obvious from the code. Prefer small, typed functions. Match the
  surrounding style.

## Testing

- Unit-test pure logic (state machine, prompt building, parsing) with `bun test`, files next to the source as
  `*.test.ts`.
- For anything touching Docker or SSE, verify against a real process and say so in your report if you could not.
  Clean up containers and volumes named `union-*` that you create.
- Do not claim something works without running it. If a check was skipped, say which.

## Git

Commit messages are short and imperative. Do not commit `*.sqlite*`, `.env` or `dist/`.
