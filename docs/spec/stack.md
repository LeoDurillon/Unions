# Stack

| Layer         | Choice                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| Runtime       | Bun + TypeScript, workspace: `packages/core`, `apps/worker`, `apps/web`                       |
| Web           | Hono API (SSE via `streamSSE`) + React/Vite SPA, Tailwind, shadcn/ui, TanStack Query, dnd-kit |
| DB            | SQLite (`bun:sqlite`, WAL) + Drizzle, shared by web and worker                                |
| Docker        | CLI behind a `ContainerRuntime` interface                                                     |
| Agent         | `claude -p --output-format stream-json` via `docker exec`, `--resume` between steps           |
| GitHub        | Octokit (GraphQL for Projects v2), token or GitHub App, polling + refresh after own writes    |
| Orchestration | Hand-rolled state machine, persisted runs, semaphore for concurrent agent runs                |

## Process model

- `web` never runs agents. UI actions insert rows into `commands`; the web streams `events` over SSE
  (`Last-Event-ID` = `events.seq`, resumable).
- `worker` polls `commands`, drives each ticket's state machine, runs agents, writes `events`, syncs GitHub.
- Restarting either process never touches running containers.

## Container model (validated by prototype)

- Images: `union-agent-base` (the `claude` CLI as its pinned release binary, git; non-root user `node`, uid 1000)
  and the default `union-agent` (the base plus node/npm, Bun, pnpm/yarn and Playwright's libraries), two stages of
  `docker/agent.Dockerfile`. A project may run on its own image instead: a Dockerfile in its settings that starts
  `FROM union-agent` or `FROM union-agent-base`, or an image built on one elsewhere, built (or pulled) and checked when
  saved and used only once it passes (`docs/plans/archive/project-agent-image.md`).
- Host clones the repo into the ticket's workspace volume.
- HOME volume is **writable** and seeded with only the `claudeAiOauth` credential and
  `{"hasCompletedOnboarding":true}`. A read-only HOME breaks `--resume`.
- Containers are stopped between steps (`docker stop`) and started for each step (`docker start` + `docker exec`).
  Volumes survive container recreation.

## Memory

- `feedback_events`: every Revise / final-review feedback (replaces `inbox.jsonl`).
- `lessons`: curated rules per project and agent section, injected into prompts at runtime, editable in the UI.
- Both are shown and edited in project settings → Memory: see [Memory](memory.md).

## Token usage

- Every agent call (ticket steps, side runs, investigations) records its tokens per model in `agent_usage`: input,
  cache reads and writes, output (and its thinking part), web searches, turns, duration, peak context and the
  API-equivalent cost. The CLI's subagent models get their own rows. The CLI reports a resumed session's totals,
  so a call's share is its result minus the session's previous one.
- Shown in the Log (each call's result line, each run's header), the Overview tab's run table (a row opens to its
  calls and models; the side runs and the ticket's total below) and an investigation's Usage tab.
- The cost is what the tokens would cost on the API: a Max subscription does not bill it. It weighs models and
  cached input against each other; it is not a quota.
- Each call also records its tool uses in `agent_tool_usage`: a row per tool key (the Bash command's family and
  form, the file read, the skill, the subagent type) with calls, errors, refusals and the size of the results.
  The project's Usage tab reads both tables for its findings (plan: `docs/plans/usage-insights.md`).
- `bun run usage:backfill` records the calls already in `agent_log`.

## GitHub mapping

| Local         | GitHub                                                                                          | Layer      |
| ------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| ticket        | issue                                                                                           | issues     |
| ticket        | Project item                                                                                    | Project    |
| ticket status | Project `Status` single-select field                                                            | Project    |
| step output   | one issue comment per step, found by hidden marker `<!-- union:ticket=<id> step=<step> -->`     | issues     |
| branch        | `<issue#>-<slug>`, or `union-<ticket id>-<slug>` for a ticket with no issue, pushed by the host | repository |
| PR            | draft PR, with `Closes #n` when the ticket has an issue                                         | repository |
| parent ticket | the child issue is "blocked by" the parent issue (issue dependencies)                           | issues     |

The repository layer is always on. Issues follow `ProjectConfig.mirrorIssues` (absent: on; always on with a
Project): off, new tickets get none, and tickets that have one (imported from a GitHub issue, or opened while it
was on) keep it and its comments. The Project layer is on while `projects.github_project_url` or
`github_project_node_id` is set (`hasGitHubProject`, `mirrorsIssues` in `github-layers.ts`).

The source of truth follows the layers. With a Project, GitHub wins for title, description and status (read from
the board's items). With issues and no Project, GitHub wins for title and description (read from the repository's
issues, `issue-pull.ts`), Union for status. With neither, Union (or the ticket's tracker, for an imported ticket)
owns everything. The local DB always owns run state.
