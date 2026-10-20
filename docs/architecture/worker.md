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
  run shell commands but never push, switch branches or rewrite history (the rebase and simplify steps do, checked by
  the host).
- `rebase.ts` (with `rebase-attempt.ts`, `rebase-host.ts`, `rebase-clean.ts`, `rebase-agent.ts`, `rebase-fetch.ts`,
  `rebase-git.ts`, `rebase-publish.ts`): the on-demand rebase step. The host fetches base and branch into the
  container as a bundle, then runs `git rebase` itself (`tryHostRebase`). Already up to date: nothing is pushed.
  Clean: the project's checks, then a force-push with a lease, with no agent; the result is `ok` with `clean`, which
  the scheduler dispatches as `rebased_clean`, so the ticket goes back to its final review (or to Done) without a
  new one. Stopped on a conflict (aborted), or clean with failing checks (the rebased branch kept): the
  implementer's session is resumed with the rebase prompt and a note saying which, then the result and the checks
  are verified and pushed, and the final review runs again. Each path writes a `union_note` line to the Log. Any
  failure puts the branch back as it was. A clean rebase saves no session, so `implementerSession` skips runs
  without one. `github/pull-request.ts` keeps `tickets.behind_by` current during the pull.
- `simplify.ts` (with `simplify-agent.ts`, `simplify-finish.ts`, `simplify-git.ts`, `simplify-push.ts`): the
  on-demand history simplification. Same fetch and implementer session as the rebase (`runInImplementerSession` in
  `rebase-agent.ts`), then the agent's leftovers are committed (`commitLeftovers`; a hook's refusal pauses the step
  like the implementer's, and the user commits without hooks or keeps the old history, which restores the branch),
  the host checks the fork point and the tree are unchanged, and force-pushes with a lease; no install, checks or
  services. Any failure puts the branch back.
- `history-steps.ts` runs the steps that rewrite a reviewed branch: simplify, and the split into a stack
  (`docs/plans/pr-stack.md`), offered only on projects with `config.stacks`. `split-plan-step.ts`: a read-only
  agent (`split_plan`, the final review's tools, a fresh session; a revision resumes it) proposes the slices in
  `SPLIT_PLAN_FORMAT`; a plan `parseSplitPlan` cannot read gets one more turn (`settlePlan`). Approved, `split.ts`
  resumes the implementer's session with the `split` prompt and the plan: `split-publish.ts` fetches the ticket's
  branch and any `<branch>-s<n>` already on GitHub (`remoteSliceBranches`, refused when one has commits the
  workspace lacks), `split-rounds.ts` sends the host's problems back in the same session up to twice
  (`verifySplit`: `simplifyProblem`, every commit's `Slice:` trailer in order, and the checks on each lower
  slice's tip unless `config.sliceChecks` is false), then the lower slices' branches are set and pushed with the
  ticket's in one `git push --atomic` with a lease each (`stack-push.ts`). `stack-publish.ts` opens or reuses a
  pull request per lower slice (draft, ready when the ticket's already is), retargets the ticket's onto the slice
  below (`updatePullRequestBase`), writes each slice's description and the stack section of the ticket's own,
  comments on the issue and records `ticket_slices`. GitHub failures after the push are warnings in the report:
  the split stands. Any failure before the push puts the branch back. `markReadyWhenDone` marks every slice's
  pull request ready. A split ticket afterwards: the implementer's prompt gets a `# Stack` section (the slices
  and their commits, `stack-revise.ts`) asking each new commit to say where it goes (`Slice: <n>`, or
  `fixup! <sha>`); after the run, `restackRevision` asks the session about any commit it cannot place, replays
  the stack with the host's todo (`git rebase -i` with `sequence.editor`, `stack-revise-git.ts`), checks the
  tree is unchanged and `pushRevision` pushes every slice atomically, leased on the recorded tips. A conflict
  while reordering fails the step, unpushed. A rebase fetches the lower slices' branches too, refuses one with
  outside commits, starts them from their recorded tips and rebases with `--update-refs` (the agent is told
  to); `stackMoveProblem` refuses a slice left behind, and `forcePush` (`branch-push.ts`) pushes the whole stack
  (`pushRewrittenStack`, `stack-refs.ts`) and records the new tips. Simplify history is refused on a split
  ticket. `captureDiff` also stores each slice's own diff (`diff-slices.ts`, `slice` rows of `diff_commits`,
  the lower slices read from their local branches), which the review page's commit picker offers as
  `slice-<n>`; a split ticket's agent review gets each slice's range and part of the spec (`stackReviewNote`).
  Merging: `github/stack-pull-requests.ts` polls every slice's pull request (`pollStack`, from
  `refreshPullRequest`), records what each merged into and its tip, and keeps the ticket open until every slice is
  merged into the base (a slice merged into another slice's branch is out of order, shown in the PR tab); once
  complete the ticket is merged and its issue closed (`closeIssue`). A slice newly merged into the base dispatches
  `restack` with `hostOnly` (`startRestack`, when the phase allows it): `restack.ts` rebases the open slices with
  `--onto origin/<base> <merged tip>` and `--update-refs` through `runRebaseStep`, without an agent when host
  only (a conflict waits for the user's Restack, which may call the rebase agent), clears the merged tips and
  retargets the new bottom pull request onto the base. Moving, pushing and recording use the open slices only
  (`openSlices`).
- `investigate.ts`: `InvestigationRunner` runs queued investigations in throwaway `union-i<id>` containers
  (removed after each run; a `ticket` investigation runs in the ticket's own container instead, `investigate-ticket.ts`:
  never during a step, writing tools always denied, `git status` and HEAD compared before and after, the container
  stopped after unless a step started; the ticket panel's Investigate opens the form with `?investigate=<id>`), sharing the scheduler's `RunSlots` (`slots.ts`); cancellation arrives through the
  `cancel_investigation` command hook. It also drives `TicketDrafter` (`investigation-ticket.ts`), which writes
  the tickets asked from investigations, in `union-i<id>-ticket` containers, and creates them in Notion too when asked
  (`investigation-ticket-notion.ts`, through `NotionApi.createPage`).
- `event-dispatcher.ts`: follows the `events` log (cursor in `event_cursors`), queues one `event_deliveries` row
  per matching rule and event (unique), and hands each due one to the target of its action's kind
  (`event-actions/`: `notion.ts` sets the rule's Notion properties in one `updatePage`, all or none, `github-comment.ts` comments on the issue or the PR with
  the project's GitHub client, `github-pull-request.ts` makes a rule's changes to the PR in order (each can be
  done again harmlessly: the description section sits between `<!-- union-rule:<id> -->` marks and is replaced, so
  a retry redoes the whole delivery; a refusal fails it and says what was done before), `github-project-fields.ts` sets fields of the issue's
  Project item (`tickets.project_item_id`) or of the PR's (added with `addToProject`, which returns the item it
  has): it reads the Project's fields and checks every value first, so a field or option gone fails it before
  anything is set, `union-notification.ts` writes a notification through the notifier's
  `recordNotification`), one at a time and at most the target's `perTick` per tick (Notion 3, GitHub 1).
  A target says when to retry (rate limits, 5xx and network errors); retries back off, up to 5 attempts; each outcome is logged as `event_rule_applied` (the
  ticket's Log tab). `github/pull-request.ts` logs `pull_request_merged`/`pull_request_closed`,
  `github/pull-request-checks.ts` logs `pull_request_checks_failed` when the open PR's checks turn red, and linking
  a PR by hand logs `pull_request_linked`, for the rules.
- `notifier.ts`: `writeNotifications`, called at the start of each `EventDispatcher` tick, follows the log with its
  own cursor (`event_cursors` name `notifications`, started at the end: the past never notifies) and writes one
  `notifications` row per event that needs the user (`notificationFor` in core decides which, unique on
  `event_seq` for these; a rule's notification is unique per rule and event, and keeps its `rule_id` after the
  rule is deleted), then logs `notification_created` without a ticket or investigation id, so it stays out of their
  logs and the browser hears of it on the shared stream.
- `agent-review.ts`: `AgentReviewRunner` (started with the investigations in `side-runs.ts`, same slots) runs
  queued agent reviews: a ticket's in its own container on its branch (`agent-review-target.ts`), a pull request's
  in a throwaway `union-a<id>` container where the host cloned it at the reviewed commit (`pr-checkout.ts`, through
  `pull/<n>/head`, so forks work). The agent ends its answer with a JSON block (`agent-review-findings.ts`, format
  appended by the host); findings outside the diff's lines become `general` drafts naming the place, so nothing is
  lost. Cancellation goes through the `cancel_agent_review` command hook.
  Given specs go in the prompt (`specsSection`), in place of the ticket's text. A stack run (members in
  `agent_review_members`, `agent-review-stack.ts`) checks every PR out in one container at its reviewed commit as
  `refs/union/pr-<n>` (`clonePullRequests`), the top one at HEAD; the prompt gives each PR's own diff
  (`<parent's ref>...refs/union/pr-<n>`) and its specs, and asks for `"pr"` on each comment. Drafts go to each PR's
  review; the summary and comments on no PR of the stack go to the top one, the comments as general ones that
  start with "Not tied to a pull request".
- `review-explain.ts`: `ReviewExplainRunner` (in `review-runs.ts` with the agent reviews and the groupings, same
  slots) runs queued `review_explanations`, one per review at a time (`claimExplanation`): a ticket's in its own
  container, a pull request's in a throwaway `union-e<id>` container (`openTarget`, removed after the run and by
  `recover`). The prompt (`review-explain-prompt.ts`) gives the specs sent, the spec parts of the newest grouping
  (`explanationSpecParts`), the change, the lines and the question; a ticket's follow-up resumes the session of the
  answer it follows (`runResumable`, the whole thread in a fresh prompt when it is lost), a pull request's runs
  fresh with the thread. `review-explain-result.ts` reads the JSON block and keeps the spec quotes found in a spec
  sent and the docs whose path exists in the checkout. Lines go to `agent_log` with `explanation_id` (and the
  ticket, so its usage counts them). Cancellation: the `cancel_review_explanation` command (`command-cancels.ts`).
- `pr-description-run.ts`: `PrDescriptionRunner` (same slots) rewrites a PR's description in the ticket's
  container, resuming the implementer's session (`runResumable`), from GitHub's current description, the PR template
  and the branch. `github/pr-description-send.ts` writes the user's version only if GitHub's description is still
  the one the agent read (else `conflict`), so an edit made on GitHub is never overwritten unseen. The first
  description (`pr-description.ts`, when the PR is opened) and the rewrite both use the `pr_description` agent.
  `github/ci-rerun.ts` handles `rerun_ci_job`: GitHub runs the failed Actions job again; it logs `ci_job_rerun` or
  `ci_job_rerun_failed` (which notifies). `github/ticket-edit.ts` handles `edit_ticket` (the title and description
  edited on the Overview): it writes them to the issue only if GitHub still has the text the edit started from
  (`base`), keeping Union's marker only when the issue had one, then to the ticket with the issue's new `updatedAt`
  as `github_updated_at`; it logs `ticket_edited` or `ticket_edit_failed`. A ticket without an issue yet is edited
  locally and the sync creates the issue with it. `github/inbound.ts` skips an item read before the last
  reconciliation (its `updatedAt` not after `github_updated_at`), so a pull that started before the edit does not
  undo it.
- `throwaway-runs.ts`: the side runs that need no repository, in a throwaway container with only the Claude login:
  the connector check (`mcp-check.ts`) and the lesson writer (`lesson-writer-run.ts`, same slots as the agents),
  which turns feedback the user picked into proposed lessons (`lesson_suggestions`; prompt and parsing in core
  `lesson-writer.ts`), and the prompt writer (`prompt-writer-run.ts`), which writes a queued custom agent's
  default prompt (`union-prompt-writer-<id>`, logs `custom_agent_prompt_ready` or `_failed`; a run cut by a stop
  goes back to the queue on start).
- `planning-step.ts`: the planning steps and the custom agents' steps (`executor.ts` routes them there);
  `custom-step.ts` gives a custom step placed after the implementation the branch and how to read the diff.
  `approved.ts` passes the approved outputs in the ticket's flow order, a custom step's under its agent's name.
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
- Previews of pull requests under review (`docs/plans/review-previews.md`): the preview code takes a
  `WorkspaceOwner` (`{ ticketId }` or `{ reviewId }`). A review's preview runs as `union-r<id>` at
  `r<id>.localhost`, from the workspace of its own container `union-r<id>` (`review-checkout.ts`): created on its
  first start, the pull request cloned on the host at `review.headSha` like an agent review's checkout, never given
  the Claude credential nor a token, stopped once the checkout is in. `current_reviews.checkout_sha` is the commit
  checked out; `checkout_in_repo` says it is on the head branch of the repository itself (fetched from `origin`
  during the clone): a fork's commit is not, and `target.ts` gives the secret variables only when it is and the
  review is not marked `from_fork`. `review_checkout_update` (`preview/review-preview.ts`) takes the preview down
  (`down -v`), empties `repo/` in a root helper, checks the review's current head out, and starts the preview again
  if it ran. Preview commands for a review have `ticket_id` null and `{ reviewId }` in their payload. A review's
  preview emits no events (its page polls); the idle watcher reads `union-r<id>-*` routers too, and
  `takeDownFor('union-r<id>')` takes it down before its container's volumes go. Commands (`container_runs` with
  `review_id`) and e2e tests run in `union-r<id>` too: `run-workspace.ts` opens a run's workspace (a ticket's
  container with the agent's services, or the review's with the plain variables the settings let through and the
  preview's address while it runs; never the secrets), and `e2e-request.ts` runs the tests the user asks for, one
  run at a time across tickets and reviews. The review's container is stopped after a run unless the other kind
  (a command, the tests) still uses it. A review's failure screenshots are `preview_screenshots` rows, the files
  under `attachments/r<id>/e2e/` (`replaceReviewScreenshots` in `@union/core`).
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
  permission rules cannot match `&&`). It records the commit it read (`step_outputs.head_sha`); a review of a
  branch reviewed before also gets the earlier review, the feedback sent since and the range of commits since
  (`review-previous.ts`; the full diff when a rebase rewrote that commit away), and is told to check the earlier
  findings and request changes only for open or new blocking ones. Changes asked at the review go to the implementer through the `thenRun`
  chain in `states.ts`; `revision.ts` hands it the review's feedback. `runResumable` (agent.ts) restarts in a fresh
  session when a resumed one is gone (rebuilt HOME volume).
- `provision.ts` creates a ticket's container, seeds credentials, and clones the repo on the host with the
  project's token, resetting `origin` to the token-free URL before copying it in; `agent.ts` runs
  `claude -p` in it and parses stream-json; `prompts.ts` builds the step prompts (for the implementer's fresh
  session and the final review, with the `# Flow` note after the job when the ticket's flow skipped planning
  steps; a short flow needs nothing else, since the implement step clones and branches on its own). The CLI can stay up after its
  last `result`, so `agent-idle.ts` watches the events. Once the last one is a `result`, every background task
  (`system/task_started`) has its `task_notification`, and 30 s pass with no new event, it sends TERM (then KILL
  10 s later) to the processes whose environment holds the run's `UNION_AGENT_RUN` token. It logs
  `union_agent_idle_stopped`, and the run then uses that last result.
- Token usage: nothing in the worker counts it. Each `result` an agent's `onEvent` sends to `appendAgentLine`
  records that call in `agent_usage` (core, `agent-usage-record.ts`), under the line's owner (`runId` for a step,
  `ticketId` alone for a side run, `investigationId`). So a new kind of agent run is counted only if its events
  reach `agent_log`: `investigation-ticket.ts` drops them, and its call is not counted. `AgentOutcome` carries no
  cost: the result's cost adds up over a resumed session.
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
