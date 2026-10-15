# apps/worker

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

`apps/worker`: long-running Bun process. Drains the `commands` table, drives state machines, runs agents, syncs GitHub, writes `events`.

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
- `services-run.ts`, `agent-services-step.ts` and `preview/background.ts`: the services a project starts for the
  agent (`config.preview.agentServices`, a database for its tests). Around implementation and rebase steps, and
  around a command from the Commands section (`startServicesRun`), the worker runs `up -d <services>` in the
  ticket's compose project (shared with the preview), joins the ticket's container to it, gives every command run
  in that container the plain variables the setting lets through (`config.preview.agentVariables`: all by default,
  none, or chosen; `agentVariables` in core; never the secrets) through `withEnvironment`, and `stop`s the services
  after (data kept) unless the preview runs or another run of the ticket uses them. A preview stopped during such
  a step removes only the services the proxy serves.
  Their published ports reach the container's `localhost` as on a laptop (unless `config.preview.forwardPorts` is
  false, for repositories already using the services' names): `previewCompose` drops `ports` but keeps
  them under `x-union-ports`, `agentForwards` (core) turns them into forwards (TCP, ranges, first service wins a
  port), and `preview/forwarder.ts` runs a Node forwarder in the container (`setsid -f`, files under
  `/tmp/union-forward.*`), listening on `127.0.0.1` and `::1`, connecting to the service per connection (a reset
  while it is down). Starting it is idempotent (same ports: reused, so a ticket's agent review shares it); the
  checks, the install command and a resumed refused commit call `deps.services.ensure()` first, which brings it
  back if the agent killed it. Ports it cannot take are logged (`agent_ports_forwarded`) and named in the prompt
  (`agentServicesHint`).
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
