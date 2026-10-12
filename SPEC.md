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
  Claude Code decides. The rebase and the PR description use the implementer's model and effort.
- Final review: the user decides on `CHANGES_REQUESTED` (no automatic loop); the reviewer states the last check result
  instead of re-running the checks.
- Rebase reuses the implementation agent (`--resume` + a rebase prompt), and the final review always re-runs
  after it.

## Flow

0. First run: a setup wizard connects GitHub (token or GitHub App installation), picks the repository, and picks or creates the GitHub Project.
1. Create a ticket (title, description), or import it from Notion when the project is connected (optional wizard
   step or project settings: integration secret + data source; the page must be a row of that data source)
   → GitHub issue added to the Project.
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
   and rebase it onto the latest base branch (see Rebase).
   **Review changes** opens a full-page diff of the branch (files on the left, one file at a time), built from a
   snapshot the worker saves after each implementation run, syntax-highlighted, unified or split (side by side; the
   choice is remembered in the browser). The user comments on a line or a block of lines; the
   comments stay local drafts until **Send review**, which is allowed when the ticket waits on the user at the
   implementation or the final review and works like Request changes.
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
  it exists on GitHub, else the project's base branch (a parent merged with its branch deleted is already in it).
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
- **Log:** agent events carry `events.investigation_id`; `/api/events?investigation=<id>` streams one run's log.
- **Not yet:** resuming the agent's own session on a follow-up, choosing another branch, turning an answer into a
  ticket.

## Rebase

Once implementation is done (final review, or Done while the PR is still open), the ticket's PR tab shows how far the
branch is behind the base branch ("4 commits behind `main`") and a **Rebase** button. The implementation agent then
rebases the branch, resolves conflicts, re-runs the checks, and the host pushes the result.

### Flow

1. **Behind count:** the worker asks GitHub (the PR, then `compare/<PR base>...<head>`, `behind_by`) during its
   regular pull, for tickets with a PR that could be rebased (at the final review, Done, or after a failed rebase),
   and stores it in `tickets.behind_by`; null for the others and once the PR is closed or merged. No count, no
   button (the web refuses the command too): a branch that is up to date shows "Up to date with `main`".
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

## Preview environments (planned)

Once a ticket reaches final review (and after it is Done), its panel shows **Start preview**. The worker starts
the app from the ticket's branch in dev mode, and a reverse proxy serves it at `http://<ticket id>.localhost`
(for example `http://12.localhost`). Browsers resolve `*.localhost` to the local machine, so no DNS setup is needed.

### Startup is configured per project

New section in the project settings, stored in `projects.config.preview`:

| Field     | Example                             | Meaning                                                            |
| --------- | ----------------------------------- | ------------------------------------------------------------------ |
| `image`   | `oven/bun:1.4.1`, `node:22`         | Image the app runs in (default: the agent image)                   |
| `install` | `bun install`                       | Run once per start, before the start command (optional)            |
| `start`   | `bun run dev --host 0.0.0.0`        | Long-running command that serves the app; must listen on all hosts |
| `port`    | `5173`                              | Port the app listens on inside the container; the proxy targets it |
| `env`     | `{ "DATABASE_URL": "file:dev.db" }` | Extra environment variables (no GitHub or Claude credentials)      |

Without a `start` command the button is hidden and the panel explains how to configure it.

### Runtime

- **Preview container:** `union-t<id>-preview`, separate from the agent container so it can run while the agent
  is stopped and be stopped on its own. It mounts the ticket's workspace volume (the checked-out branch), runs
  `install` then `start`, and joins the proxy network. It holds no GitHub or Claude credentials.
- **Reverse proxy:** a Traefik container in the compose stack, listening on port 80 (configurable, for example
  8080 → `http://12.localhost:8080`). The worker labels each preview container with its host rule, so routes appear
  and disappear with the containers; WebSockets (Vite HMR) pass through.
- **Commands:** `preview_start`, `preview_stop` and `preview_restart` go through `commands` like everything else;
  only the worker touches Docker. State is stored on the ticket (`stopped`, `starting`, `running`, `failed`) and
  streamed as events. The preview's stdout/stderr feed a **Preview log** tab.
- **Lifecycle:** at most N previews run at once (default 3). A preview stops when the ticket is revised back into
  implementation, archived or deleted, and when the worker shuts down. Restart re-runs `install` and `start`.
- **Ready check:** `starting` becomes `running` once the port answers HTTP, or `failed` after a timeout, with the
  log tail shown in the panel.

### Open questions

- Apps that need extra services (database, queue): a compose file in the repository started per ticket, or out of
  scope for the first version?
- Several exposed ports (separate frontend and API): route `api.<id>.localhost` to a second port, or keep one port?
- Expose the preview on the local network, or only on this machine (default: this machine only)?

## Open risks

1. OAuth refresh inside a ticket volume may invalidate the host login (untested; needs a test near token expiry).
   Fallback: `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`.
2. Hono SSE behaviour on client disconnect in production (checked in the skeleton).
3. Max rate limit under parallel tickets → `rate_limited` is a first-class ticket state.

## Out of scope for now

Multi-user, auth on the web UI, hosted deployment, webhooks.
