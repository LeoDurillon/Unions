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
- Final review: the user decides on `CHANGES_REQUESTED` (no automatic loop); the reviewer states the last check result
  instead of re-running the checks.
- Rebase reuses the implementation agent (`--resume` + a rebase prompt), and the final review always re-runs
  after it.

## Flow

0. First run: a setup wizard connects GitHub (token), picks the repository, and picks or creates the GitHub Project.
1. Create a ticket (title, description), or import it from Notion when the project is connected (optional wizard
   step or project settings: integration secret + data source; the page must be a row of that data source)
   → GitHub issue added to the Project.
2. Move to In Progress → the worker creates volumes + container, clones the repo into the workspace volume.
3. Planning steps, each a tab on the ticket: `intake` (Haiku) → `summary` (Sonnet) → `technical` (Opus) → `test_plan` (Sonnet).
   After each, the user clicks **Approve** or **Revise** (with feedback). Revise resumes the agent session.
   Each step's output is posted/edited as one issue comment.
4. After the test plan is approved: `implement` loop (agent turn → checks → back to the agent on red, up to the
   project's iteration limit), then the host pushes the branch and opens a draft PR (`Closes #n`). Install and check
   commands are set per project. Reviewer agents and the refactor pass are not built yet.
5. `final_review`: a fresh review agent (read-only plus `git diff/log/show/status`) compares the branch with the approved
   plan and starts its review with `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`. It does not re-run the
   checks; it states the last result from the implementation report. The user decides: **Approve** marks the PR
   ready for review and moves the ticket to Done; **Request changes** (or **Send findings to the implementer**,
   which pre-fills the request with the review's findings) resumes the implementer, whose output is accepted
   automatically and followed by a new review, without an approval in between. Nothing loops on its own.
   From final review onward the user can run the ticket's branch as a live preview (see Preview environments),
   and rebase it onto the latest base branch (see Rebase).
   **Review changes** opens a full-page diff of the branch (files on the left, one file at a time), built from a
   snapshot the worker saves after each implementation run. The user comments on a line or a block of lines; the
   comments stay local drafts until **Send review**, which is allowed when the ticket waits on the user at the
   implementation or the final review and works like Request changes.
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

GitHub is the source of truth for title, description and status; the local DB owns run state.

## Rebase (planned)

Once implementation is done (final review, or Done while the PR is still open), the ticket panel shows how far the
branch is behind the base branch ("4 commits behind `main`") and a **Rebase** button. The implementation agent then
rebases the branch, resolves conflicts, re-runs the checks, and the host pushes the result.

### Flow

1. **Behind count:** the worker asks GitHub (`compare/<base>...<branch>`, `behind_by`) during its regular polling,
   for tickets with a pushed branch and an open PR. No count, no button: a branch that is up to date shows
   "Up to date with `main`".
2. **Fetch for the container:** the container has no GitHub credentials, so the host fetches the base branch with
   the project token, writes it as a `git bundle`, copies the bundle in, and fetches from it inside the container
   (`refs/remotes/origin/<base>`). The same path will serve the implement loop.
3. **Agent run (decided):** the same implementation agent, started with `claude -p --resume <implement session id>`
   and the rebase prompt, on the Implementation model. There is no separate rebase agent; the rebase prompt is its
   own entry in Agent settings (default: rebase onto `origin/<base>`, resolve conflicts keeping both intents, run
   the project's checks, fix what the rebase broke, abort if unsafe, never push). Allowed tools add `git rebase`,
   `git merge-base` and the checks; push stays denied.
4. **Push:** on success the host force-pushes with `--force-with-lease` (the rebase rewrites history), so a commit
   pushed by someone else in the meantime is never overwritten; the PR updates by itself. The step's report
   (conflicts met and how they were resolved, check results) becomes the step's output and issue comment.
5. **Back to review (decided):** the diff changed, so `final_review` always runs again and the ticket returns to awaiting final
   review. A ticket that was Done goes back to In review.

### Failure

- Conflicts the agent cannot resolve, or checks that still fail: the agent runs `git rebase --abort`, so the branch
  is left exactly as it was, and the ticket goes to `failed` on the `rebase` step with the agent's explanation.
  **Retry** runs it again; **Revise** gives the agent guidance first ("keep our version of the API client").
- Push rejected by the lease (the remote branch moved): `failed` with a message; nothing is overwritten.

### State machine

New action `rebase`, allowed from `awaiting_approval` on `final_review` and from `done` while the PR is open, leading
to `running` on the `rebase` step; `run_finished` on `rebase` leads to `running` on `final_review`.

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
