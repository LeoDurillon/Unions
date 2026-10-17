# union-next — spec

A local Kanban over a GitHub Project. Moving a ticket to **In Progress** spawns a Docker container that runs an
agent pipeline (planning → implementation → review) on the project's repo, using the user's Claude Max subscription.
Everything the agent does is mirrored to the GitHub issue.

## Decisions

- One repo per project (one board per GitHub Project).
- Planning runs first; implementation starts only after the test plan is approved.
- One GitHub comment per step, edited in place on revision.
- Parallel tickets, capped by a concurrency limit (Max usage limits).
- Fresh codebase. The earlier POCs (`claude-auto`, `Union`) are context only.
- One persistent container per ticket, with one HOME volume and one workspace volume per ticket.
- The host owns every GitHub write and pushes the ticket's branch. The container holds no GitHub credentials.
- Memory (feedback + lessons) lives in the database.
- GitHub access per project: a personal access token (classic or fine-grained) or an installation of one global
  GitHub App (App ID + private key stored once; installation tokens are minted per use and expire after an hour).
  Fine-grained tokens and apps cannot reach Projects owned by a user account: those need a classic token.
- Each agent with a model (the pipeline steps) has an editable prompt, model, thinking effort and tools in Agent
  settings. The effort is passed as `claude --effort` (low, medium, high, xhigh, max); Default passes nothing, so
  Claude Code decides. The rebase, the history simplification and the PR description use the implementer's model
  and effort.
- Final review: the user decides on `CHANGES_REQUESTED` (no automatic loop); the reviewer states the last check result
  instead of re-running the checks.
- Rebase reuses the implementation agent (`--resume` + a rebase prompt), and the final review always re-runs
  after it.

## Flow

0. First run: a setup wizard connects GitHub (token or GitHub App installation), picks the repository, and picks or creates the GitHub Project.
1. Create a ticket (title, description), or import it from Notion when the project is connected (optional wizard
   step or project settings: integration secret + data source; the page must be a row of that data source)
   → GitHub issue added to the Project. Or import an existing issue of the repository (number or URL; pull requests
   and issues already on a ticket are refused): the ticket is on that issue, which the sync adds to the Project
   instead of creating one, and its title and description keep following GitHub.
2. Move to In Progress → the worker creates volumes + container, clones the repo into the workspace volume.
   A ticket that depends on another one cannot start before it is done (see Ticket dependencies).
3. Planning steps, each a tab on the ticket: `intake` (Haiku) → `summary` (Sonnet) → `technical` (Opus) → `test_plan` (Sonnet).
   After each, the user clicks **Approve** or **Revise** (with feedback). Revise resumes the agent session.
   Each step's output is posted/edited as one issue comment.
4. After the test plan is approved: `implement` loop (agent turn → checks → back to the agent on red, up to the
   project's iteration limit), then the host pushes the branch and opens a draft PR (`Closes #n`). Before opening
   it, one more turn in the implementer's session writes the PR description: it fills in the repository's pull
   request template when there is one (`.github/`, root or `docs/`, any case, else the first file of
   `.github/PULL_REQUEST_TEMPLATE/`), in the template's language, else a short summary, changes and testing in the
   ticket's language. The host adds `Closes #n` (and the stacked-PR note) below it; if the turn fails, the PR gets
   that default body. An existing PR is never redescribed. Install and check commands are set per project. Reviewer
   agents and the refactor pass are not built yet.
5. `final_review`: a fresh review agent (read-only plus `git diff/log/show/status`) compares the branch with the approved
   plan and starts its review with `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`. It does not re-run the
   checks; it states the last result from the implementation report. The user decides: **Approve** marks the PR
   ready for review and moves the ticket to Done; **Request changes** (or **Send findings to the implementer**,
   which pre-fills the request with the review's findings) resumes the implementer, whose output is accepted
   automatically and followed by a new review, without an approval in between. Nothing loops on its own.
   From final review onward the user can run the ticket's branch as a live preview (see Preview environments),
   rebase it onto the latest base branch (see Rebase), and simplify its commit history (see Simplify history).
   **Review changes** opens a full-page diff of the branch (files on the left, one file at a time), built from a
   snapshot the worker saves after each implementation run, syntax-highlighted, unified or split (side by side; the
   choice is remembered in the browser). The user comments on a line or a block of lines; the
   comments stay local drafts until **Send review**, which is allowed when the ticket waits on the user at the
   implementation or the final review, or once it is Done (its branch is kept and its pull request is not merged),
   and works like Request changes: the
   implementer works on the comments, then the final review runs again (from Done, the feedback is recorded on the
   final review and the ticket goes back to In progress).
   The ticket panel has three tabs: **Overview** (description, links, actions, runs), **Worker** (one tab per step,
   then the Log; it follows the running step) and **PR** (link the pull request, then its GitHub discussion, read
   only). From the PR tab or the review header, **Import** adds the unresolved line-comment threads as drafts,
   replies folded in with their authors; each lands on its lines of the current diff, or reads as outdated with
   GitHub's excerpt when those lines are gone. Review summaries and conversation comments are added one by one
   (**Add to review**), since bots post many of them: they become `general` drafts (no file or lines), sent under
   "On the pull request" before the line comments. `review_comments.github_url` makes a re-import skip what is
   already there. HTML comments and layout tags are dropped from GitHub text (`githubText`).
6. On archive (or project deletion) the containers and volumes are removed. Done alone keeps them, so the
   preview still works after approval.

## Stack

| Layer         | Choice                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| Runtime       | Bun + TypeScript, workspace: `packages/core`, `apps/worker`, `apps/web`                       |
| Web           | Hono API (SSE via `streamSSE`) + React/Vite SPA, Tailwind, shadcn/ui, TanStack Query, dnd-kit |
| DB            | SQLite (`bun:sqlite`, WAL) + Drizzle, shared by web and worker                                |
| Docker        | CLI behind a `ContainerRuntime` interface                                                     |
| Agent         | `claude -p --output-format stream-json` via `docker exec`, `--resume` between steps           |
| GitHub        | Octokit (GraphQL for Projects v2), fine-grained PAT, polling + refresh after own writes       |
| Orchestration | Hand-rolled state machine, persisted runs, semaphore for concurrent agent runs                |

### Process model

- `web` never runs agents. UI actions insert rows into `commands`; the web streams `events` over SSE
  (`Last-Event-ID` = `events.seq`, resumable).
- `worker` polls `commands`, drives each ticket's state machine, runs agents, writes `events`, syncs GitHub.
- Restarting either process never touches running containers.

### Container model (validated by prototype)

- Base image: `claude` CLI, git, Bun; non-root user.
- Host clones the repo into the ticket's workspace volume.
- HOME volume is **writable** and seeded with only the `claudeAiOauth` credential and
  `{"hasCompletedOnboarding":true}`. A read-only HOME breaks `--resume`.
- Containers are stopped between steps (`docker stop`) and started for each step (`docker start` + `docker exec`).
  Volumes survive container recreation.

### Memory

- `feedback_events`: every Revise / final-review feedback (replaces `inbox.jsonl`).
- `lessons`: curated rules per project and agent section, injected into prompts at runtime, editable in the UI.

### GitHub mapping

| Local         | GitHub                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| ticket        | issue + Project item                                                                        |
| ticket status | Project `Status` single-select field                                                        |
| step output   | one issue comment per step, found by hidden marker `<!-- union:ticket=<id> step=<step> -->` |
| branch        | `<issue#>-<slug>`, pushed by the host                                                       |
| PR            | draft PR, `Closes #n`                                                                       |
| parent ticket | the child issue is "blocked by" the parent issue (issue dependencies)                       |

GitHub is the source of truth for title, description and status; the local DB owns run state.

## Ticket dependencies

A ticket can depend on one other ticket of the same project, its parent, set in the New ticket dialog or on the
ticket's Overview while it is in the backlog (`tickets.parent_ticket_id`; cycles are refused).

- **Start gate:** the child cannot start until the parent is Done. The check lives in core (`blockingParent`,
  called by `dispatch` on `start`), so the web refuses with 409, the worker refuses a queued start, and a move to
  In Progress made on GitHub is reverted (`start_blocked` event). The board shows "Waiting for parent" and the card
  cannot be dragged.
- **Branch:** at the child's first clone the worker picks its base (`resolveTicketBase`): the parent's branch while
  its pull request is open and the branch exists on GitHub, else the project's base branch. A parent whose PR is
  merged is already in it; one whose PR is closed is dropped, and the child's "Builds on" section says its changes
  are not in the code (`parent_pull_request_ended` event). The PR state is the one the worker last polled.
  While the ticket is in Backlog the user can choose its base in Overview (`tickets.chosen_base_branch`, any branch
  of the repository, checked on GitHub when saved); it wins over the parent's branch at the first clone, unless it is
  gone by then (`chosen_base_missing` event, automatic choice).
  The choice is stored in `tickets.base_branch` and used everywhere the project's base was: clone, the ticket
  branch's starting point, the review's `git diff <base>...HEAD`, the diff snapshot, and the PR base. A stacked PR
  says "Builds on #<parent PR>, which it targets: merge that one first."
- **Prompts:** every agent of the child gets a "Builds on" section with the parent's title and description.
- **GitHub:** once both issues exist, the worker marks the child's issue "blocked by" the parent's (REST issue
  dependencies, `github/dependency.ts`) and records it in `tickets.github_blocked_by`. Changing or removing the
  parent swaps or removes that relation. Local links win: dependencies edited on GitHub are not pulled back, and
  Union only removes the relation it added.

## Pull requests

The project bar's **Pull requests** tab lists the repository's pull requests, read from GitHub by the web server
(GraphQL, read only, newest 100 by last update): Open (the default), Closed (closed and merged) or All. Each shows its
state (open, draft, merged, closed), author, branches, review decision, size and, when a ticket is linked to it, an
**Open ticket** button. It is fetched when the tab opens, at most once a minute, or on **Refresh**: live events do
not refetch it.

A pull request without a ticket shows **Add to reviews** on hover (or keyboard focus): it joins the **Current
reviews** tab, per project (`current_reviews`, a snapshot of its title, author and branches, so the tab needs no
GitHub call), where it can be removed.

**Open review** opens the same review page as a ticket's (file list, highlighted unified or split diff, comments on
a line or a block of lines), with three tabs: **Description** (the pull request's description) and **Comments** (its
review summaries, conversation comments and line threads, read only), both read from GitHub once per opening, then
**Diff**. The pull request's head commit and files are read from GitHub when the page opens and
kept on the review (`current_reviews.files`, `head_sha`): comments are checked against those lines, and those
written on an earlier head read as outdated. **Send review → Post on GitHub** queues a `submit_pr_review` command;
the worker posts one "Comment" review on the pull request: the overall note as its body, each draft on the reviewed
head as a line comment, and the others quoted in the body with their code (GitHub refuses line comments outside the
current diff). The posted drafts turn sent; a failure leaves them drafts and shows GitHub's reason
(`submit_status`). Approving or requesting changes is not offered yet.

**CI checks** of a ticket's pull request (`docs/plans/pr-checks.md`), in the PR tab under the branch status, while
the PR is not merged (read when the tab opens, every 30 s while a check runs, and on Refresh): the web reads the head commit's check runs and commit statuses and the PR's bot comments. The user picks failed checks, other
GitHub Actions jobs of the head (their findings may be there) and bot comments; each is read again into text (a
failed check's link, annotations and failed step's log; a job's log without the scripts its steps echo; a comment's
body), previewed, then kept for the implementer's next run or sent now as one revision with a note (at the final
review or once done), in `ci_outputs`. The implementer reads them as data in a "Failed CI checks" section after the
command outputs, the newest 6 blocks, once. The GitHub App needs read access to Checks, Commit statuses and Actions.

## Project instructions

Project settings → **Instructions**: free markdown stored in `projects.config.instructions` and sent to every agent
run on that project, under a `# Project instructions` heading: after the shared instructions for ticket steps
(planning, implementation, final review), and before the scope note for investigations. They are read on every run,
so an edit applies from the next run.

## Investigations

A one-off agent run on a custom prompt, outside the ticket pipeline (project bar → **Investigations** tab, next to
**Board**). It creates no ticket and no GitHub issue; the answer stays in Union (`investigations` table).

- **Scope:** `repository` runs on a fresh host clone of the project's repository at its base branch (agent cwd
  `/workspace/repo`); `global` runs with no code (cwd `/workspace`), for general subjects.
- **Run:** the user picks the model and the tools (same list as the agents; `BASE_DENIED` still applies). The web
  inserts the row as `queued`; the worker claims it (`claimInvestigation`), runs `claude -p` once in a throwaway
  container `union-i<id>` with its own volumes, stores the final answer or the error, and removes the container
  and volumes. Investigations share the `UNION_MAX_CONCURRENT` slots with tickets.
- **Status:** queued → running → succeeded | failed | cancelled. Cancel is a `cancel_investigation` command (a
  queued run is cancelled at once, a running one is aborted). Run again re-queues a finished one with the same
  prompt. A run left `running` by a stopped worker is failed at the next start and its container removed.
- **Follow-up:** once answered, the user can ask a follow-up question. The latest question and its answer move to
  `investigations.history` and the run is queued again; the agent gets the earlier questions and answers in its
  prompt (each run is still a fresh container and session, and a repository investigation reads a fresh clone).
  Run again repeats the latest question.
- **Log:** agent output is logged in `agent_log` with `investigation_id`; `/api/events/log?investigation=<id>`
  returns the run's Log (its events and agent output, in order) from a cursor.
- **Ticket:** **Create ticket** on an answered investigation asks for optional context (what the ticket must cover).
  The worker (`TicketDrafter`, driven by the investigation runner, sharing the run slots) writes it in a throwaway
  container `union-i<id>-ticket` from every question and answer plus that context, in the language of the user's
  questions: a title, then the problem, what to change, acceptance criteria and the useful findings. It lands in the
  Backlog (its GitHub issue follows as for any ticket), and the investigation links to it (`ticket_id`); another one
  can be asked afterwards. `ticket_status` is `queued`, `running` or `failed` (with `ticket_error`) meanwhile.
  When the project has a Notion data source, **Also create it in Notion** (`ticket_in_notion`) makes the worker add a
  page with the ticket's title and description to that data source and link the ticket to it (`notion_page_id`, so
  the Notion event rules apply). If Notion refuses, the ticket is still created and `ticket_error` says why it has no
  page.
- **Not yet:** resuming the agent's own session on a follow-up, choosing another branch.

## Rebase

Once implementation is done (final review, or Done while the PR is still open), the ticket's PR tab shows how far the
branch is behind the base branch ("4 commits behind `main`") and a **Rebase** button. The implementation agent then
rebases the branch, resolves conflicts, re-runs the checks, and the host pushes the result.

### Flow

1. **Pull request state and behind count:** during its regular pull, the worker asks GitHub about every ticket's
   pull request and stores its state (`tickets.pr_state`: open, closed or merged; a merged one is final and no longer
   asked about). For tickets that could be rebased (at the final review, Done, or after a failed rebase) with an open
   pull request, it also stores how far behind it is (`tickets.behind_by`, from `compare/<PR base>...<head>`); null
   otherwise. No count, no button (the web refuses the command too): a branch that is up to date shows "Up to date
   with `main`", a merged pull request "The pull request is merged".
2. **Fetch for the container:** the container has no GitHub credentials, so the host fetches the base branch and
   the pushed branch with the project's credentials, writes them as a `git bundle`, copies it in and fetches from it
   inside the container (`origin/<base>`, the local `<base>` that diffs compare with, and `origin/<branch>`). If the
   pushed branch has commits the workspace lacks (someone pushed), the rebase stops before the agent runs: rewriting
   would drop them.
3. **Agent run (decided):** the same implementation agent, started with `claude -p --resume <implement session id>`
   and the rebase prompt, on the Implementation model. There is no separate rebase agent; the rebase prompt is its
   own entry in Agent settings (default: rebase onto `origin/<base>`, resolve conflicts keeping both intents, run
   the project's checks, fix what the rebase broke, abort if unsafe, never push). Allowed tools add `git rebase`,
   `git merge-base`, `git add` and `git status`; push, checkout, reset and branch deletion stay denied. A lost
   session falls back to a fresh one given the task and the approved plan first.
   The host then checks the result: no rebase left unfinished, still on the branch, `origin/<base>` now in its
   history; it runs the project's check command.
4. **Push:** on success the host force-pushes with `--force-with-lease` on the commit it fetched (the rebase
   rewrites history), so a commit pushed by someone else in the meantime is never overwritten; the PR updates by
   itself, and the review diff is captured again. The step's report
   (conflicts met and how they were resolved, check results) becomes the step's output and issue comment.
5. **Back to review (decided):** the diff changed, so `final_review` always runs again and the ticket returns to awaiting final
   review. A ticket that was Done goes back to In review.

### Failure

- Conflicts the agent cannot resolve, checks that still fail, or any other failure: the host aborts any rebase in
  progress and resets the branch to the commit it started from, so it is left exactly as it was (and unpushed),
  and the ticket goes to `failed` on the `rebase` step with the reason and the agent's report. **Retry** runs it
  again. Not yet: **Revise** to give the agent guidance first ("keep our version of the API client").
- Push rejected by the lease (the remote branch moved): `failed` with a message; nothing is overwritten.

### State machine

New action `rebase`, allowed from `awaiting_approval` on `final_review` and from `done` (the web checks the PR is
open), leading to `running` on the `rebase` step with `thenRun: final_review`, so `run_finished` leads to `running`
on `final_review`; a retry keeps that chain. `rebase` is a `Step` but not a pipeline step (`STEPS`); it shows on the
board as In review.

## Simplify history

While the ticket's pull request is open, its PR tab shows **Simplify history**, usable at the final review or once
Done. The implementation agent rewrites the branch's commits into a history a reviewer reads commit by commit
(fix-ups folded in, one commit per logical change, messages in the repository's style); the code must not change.

1. **Fetch:** as for a rebase, the host brings the base and the pushed branch into the container as a bundle; a
   pushed branch with commits the workspace lacks stops it before the agent runs.
2. **Agent run:** `claude -p --resume <implementer session>` with the `simplify` prompt (Agent settings → Simplify
   history), told the branch and its fork point (`git merge-base HEAD origin/<base>`). Allowed tools add `git reset`,
   `git rebase`, `git add`, `git apply`, `git commit` and `git status` (no editor: `rebase -i` and `add -p` cannot be
   used); push, checkout and branch deletion stay denied.
3. **Refused commits:** a hook is never bypassed by the agent. When one refuses a commit, the agent stops, leaves
   what is not committed yet staged and ends its report with `Refused commit: <message>`; changes it left without
   one are committed with a message asked from its session, as for the implementer. A refusal pauses the step
   (`commit_refused` on `simplify`, `thenDone` kept) with the files and the hook's output, nothing pushed. The user
   either commits them without the hooks (the last commit of the new history), then the checks and the push run;
   or keeps the old history: the branch is put back as it was and the ticket returns where it was. Leaving the
   changes out is not offered, since it would change the code.
4. **Checks by the host:** no rebase left unfinished, still on the branch, nothing uncommitted, the same fork point
   (moving onto a newer base is a rebase), and the same tree at the end (`HEAD^{tree}`). No install, checks or agent
   services run: the code is the same.
5. **Push:** force-push with `--force-with-lease` on the fetched commit, then the review diff is captured again
   (`branch_pushed` with `simplified: true`). A history left as it was pushes nothing. The agent's report and the
   commit counts are the step's output and issue comment.
6. **After:** the final review still stands, so the ticket returns to awaiting final review, or to Done when it
   came from there (`thenDone` in the phase, kept through a failure and its retry). Any failure puts the branch back
   as it was, unpushed, with the reason and the agent's report; **Retry** runs it again.

State machine: action `simplify`, from `awaiting_approval` on `final_review` (→ `running` `simplify`) and from
`done` (→ `running` `simplify` with `thenDone`); `run_finished` leads back. `simplify` is a `Step` but not a
pipeline step; it shows on the board as In review while it runs.

## Preview environments

Built (phases 1 to 4). Full design and what was built: [`docs/plans/preview-environments.md`](docs/plans/preview-environments.md). In short:

- A ticket's branch runs from the repository's own Docker Compose file (path set per project), so apps with a
  database or a queue work. Each ticket is its own compose project (`union-t<id>`): its own containers, network and
  volumes, no published host ports.
- It runs from the ticket's workspace volume (the agent's live working copy), through a short-lived helper
  container that holds the Docker socket; the agent's container never does. The worker resolves the file with
  `docker compose config`, refuses dangerous settings (privileged, host network, Docker socket, mounts leaving the
  repository, external volumes), turns source mounts into mounts of the workspace volume, and writes a new file with
  Traefik labels on the exposed services: `http://<id>.localhost`, `http://api.<id>.localhost`.
- Per-project environment variables (secrets kept server side) with templates such as `{service.api.url}`, given to
  compose and optionally as an app env file inside a service, never written into the workspace.
- End-to-end tests: the agent's container joins the preview's network; Chromium's libraries are in the agent image,
  the browser is installed at the repository's Playwright version on first use. The project's e2e command runs only
  when the user asks, from the ticket ("Run e2e tests", one run at a time: they take a lot of memory); a failure can
  be sent to the agent as a revision.
- Compose additions (project settings → Previews → Services): YAML merged over the repository's file as a second
  `-f`, for what Union adds without changing the repository (a database restore, migrations, a seed). Kept in the
  settings, written only in the compose helper.
- Project files (project settings → Project → Files): files put at a path in every ticket's repository before each
  step and preview start, kept out of git (`.git/info/exclude`) and refused in pushes, never readable from the
  browser. A database dump for the additions' restore, a local config.
- Services for the agent: chosen compose services run in the ticket's project while it implements or rebases (a
  database for its tests), and while the user runs a command from the ticket, stopped after. The ports they publish
  in the compose file are forwarded to the ticket container's `localhost` (IPv4 and IPv6), so the repository's
  laptop settings (`.env.test` with `localhost:5432`) work unchanged; the agent is told where each one answers. A
  project whose settings already use the services' names turns it off (Previews → Services, "Reach them on
  localhost"). Which
  plain variables the agent's commands get is a setting (all by default, none, or chosen): a variable already set
  wins over the repository's env files. Secrets never reach the agent.
- Served to this machine only (the proxy's port is published on `127.0.0.1`). A running preview nobody visited for
  the project's idle time (60 minutes by default, 0: never) stops, except while the agent runs a step on the ticket
  or its e2e tests run; visits are the proxy's request counts. At most `UNION_MAX_PREVIEWS` previews run (3), and
  optionally fewer per project (Previews → Limits).
- Commands: from the Preview tab the user runs a command in the ticket's workspace (its container, in the checkout,
  as the agent, with its services, variables and `localhost` ports, and the preview's address while it runs) and reads the end of its output, live. Never during a
  step, one at a time per ticket, 10 minutes by default (30 at most), cancellable. A finished output can be kept
  for the implementer's next run, or sent now as a revision with a note (at the final review or once done); the
  implementer reads it as data in a "Command output from the user" section, once. Commands run often are saved by
  name in Project settings → Scripts (`config.scripts`: name, command, optional timeout) and run with one button;
  the run keeps the script's name. Running in a preview service is planned (`docs/plans/container-commands.md`).

## MCP servers for agents (planned)

**Built first: claude.ai connectors.** The account's claude.ai connectors (Figma…) reach every agent container
through the Claude login alone: their tokens stay with Anthropic. Agent settings → Connectors reads them
(`claude mcp list` in a throwaway `union-mcp-check` container, no model run) into `mcp_connectors`; each is offered
in the tool list as `mcp__claude_ai_<Name>` (all its tools) and selected per agent or investigation like any tool. A
run gets `ENABLE_CLAUDEAI_MCP_SERVERS=true` only when its tools include a connector, `false` otherwise, so runs
without one no longer load the connectors' tools. The rest of this section (servers that are not connectors) is
still planned.

Agents can use MCP servers the user configures (an error tracker, docs, a database, a design tool such as Figma),
chosen per agent like the tools. Today an agent container gets only the Claude login (`claudeAiOauth`): no
`~/.claude.json`, so no MCP servers. Servers are passed on each run, never installed in the container.

### Constraint that shapes it

An agent has Bash and can read anything in its container, and repository content can carry prompt injections. A
secret placed in the container is a secret the agent can print or send away. The rule "containers never hold GitHub
credentials" extends to every credential that can be kept out.

**Decided exception: OAuth servers.** A server that only signs in through the browser (Figma's official
`https://mcp.figma.com/mcp`) has its OAuth token copied into the container for the runs that use it: the user
accepts this per server when adding it, and the narrowing below applies. Building it changes the AGENTS.md rule
"Never copy `mcpOAuth` into a container" to allow exactly this, and nothing else.

### Configuration

- **Registry** (Agent settings → MCP servers, global like the tool list), table `mcp_servers`:
  `name` (slug, the `mcp__<name>__*` prefix), `transport` (`http` or `stdio`), for `http` the `url` and either secret
  `headers` or `auth = 'oauth'`, for `stdio` the `command`, `args` and secret `env`. Secrets (headers, variables, the
  OAuth token in `oauth`) are stored like the GitHub token (plain text, local app) and never sent to the browser: the
  page shows which are set and whether the server is signed in, not their values. A server whose credentials reach
  the container (OAuth, or stdio with variables) needs a ticked "agents using it can read its credentials during a
  run" when added, and is labelled so wherever it can be selected.
- **Per agent**: `agent_configs.mcp_servers` lists the servers an agent may use (multi-select under its tools);
  investigations pick theirs in the new-investigation form. Nothing is enabled by default.
- **Per project** (if wanted, see questions): a project can override a server's `url`, headers or variables, for
  example its own Sentry project.

### Runtime

- Each run gets `--mcp-config '<json>' --strict-mcp-config` built from the agent's servers: only those servers load,
  whatever is in the container. Their tools are allowed with `--allowedTools mcp__<name>` (the whole server); denied
  rules still win.
- **HTTP servers go through the worker.** The worker listens on a proxy port (`UNION_MCP_PROXY_PORT`); the run's
  config points the server at `http://host.docker.internal:<port>/mcp/<run token>/<name>`. The proxy checks the run
  token (random, valid only while that run lasts), adds the real headers and forwards to the server. The secrets stay
  in the worker; the container only ever sees a token that dies with the run. Agent containers get
  `--add-host host.docker.internal:host-gateway`; in compose the worker publishes the port to the host.
- **stdio servers run inside the container**, started by Claude Code with the configured command (`npx` and `bunx` are
  in the agent image; Python servers need `uvx`, so a project image). Their `env` secrets are therefore visible to the
  agent: the settings page marks such a server "credentials visible to the agent", and an HTTP server (or an HTTP
  bridge) is preferred whenever the server needs a secret.
- **Never GitHub write access**: a GitHub MCP server with a token would let an agent write to GitHub around the
  host. The registry refuses servers whose secrets look like GitHub tokens (`ghp_`, `github_pat_`, `ghs_`), and the
  docs say why.
- **Log**: MCP tool calls show in the Log tab like other tools. The proxy records one event per call (server, tool
  name, duration, status), never the bodies.

### OAuth servers (Figma)

Claude Code signs in to such servers itself, as an approved client (Figma lets only listed clients connect), with
`claude mcp login <name> --no-browser`, which prints the authorization URL and waits for the redirect URL to be
pasted back. Union drives that and keeps the token.

1. **Sign in** (Agent settings → MCP servers → Sign in): a `mcp_login` command. The worker starts a sign-in
   container `union-mcp-<name>` (Claude login seeded, only that server configured), runs the login there, and
   stores the printed URL on the server (`login_status: waiting`); the page shows it as a link.
2. The user approves in Figma. The browser then goes to `http://localhost:<port>/callback?code=…` and fails to load:
   that is expected. The user pastes that address into the page; the worker writes it to the waiting login.
3. The worker reads the server's `mcpOAuth` entry from the sign-in container's `~/.claude/.credentials.json`, stores
   it on the server (`oauth`), marks it signed in, and removes the container. A failure or timeout (10 minutes)
   leaves it signed out with the reason.
4. **Each run** of an agent that selected the server: the worker merges the stored entry into the container's
   `.credentials.json` (next to the Claude login) and passes the server with `--mcp-config` at its real URL (not
   through the proxy: the token is Claude Code's own). Claude Code refreshes it when needed.
5. **After the run** (success, failure or cancel) the worker reads the entry back, keeps it if Claude Code refreshed
   it (newer expiry), and removes it from the container. Runs using the same OAuth server do not overlap: the next one
   waits for a slot on that server, so two copies never refresh concurrently and invalidate each other.
6. **Expired or revoked**: the run's MCP tools fail and the agent carries on without them; the worker marks the
   server "sign in again" (from the run's MCP status) and the next runs skip it until then.

Narrowing: the token is in a container only during runs that selected the server, never in investigations or
agents that did not, never in the image, and never in the browser. It is still readable by the agent during those
runs; that is the accepted risk.

Checked on 2026-10-14 (details in [`docs/plans/mcp-servers.md`](docs/plans/mcp-servers.md)): the login refuses a
pipe and works under a pseudo-terminal; and claude.ai connectors (Figma among them, once connected in claude.ai)
already reach agent containers through the Claude login alone, without any token copied. The plan now prefers
connectors for OAuth servers and keeps this flow as a fallback. Paused until a Figma account with MCP access is
available to test with.

### Order of work

1. Registry and per-agent selection, `--mcp-config`/`--strict-mcp-config`, and OAuth servers with the sign-in flow
   (Figma first): the two checks above, tests with a fake MCP server, then one real Figma run.
2. HTTP servers with header secrets through the proxy.
3. stdio servers (no secrets, or secrets marked visible).
4. Per-project overrides and a "Test" button (the worker starts the server once and lists its tools).

### Open questions

- Per-project overrides from the start, or global servers only?
- For stdio servers that need a secret: allow it with the warning, or HTTP only?

## Open risks

1. OAuth refresh inside a ticket volume may invalidate the host login (untested; needs a test near token expiry).
   Fallback: `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`.
2. Hono SSE behaviour on client disconnect in production (checked in the skeleton).
3. Max rate limit under parallel tickets → `rate_limited` is a first-class ticket state.
4. MCP OAuth tokens (Figma) are readable by the agent during the runs that use them; a prompt injection in a
   repository could send one away. Accepted per server; revoke it in Figma if a run looks wrong.

## Out of scope for now

Multi-user, auth on the web UI, hosted deployment, webhooks.
