# Stack

| Layer         | Choice                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| Runtime       | Bun + TypeScript, workspace: `packages/core`, `apps/worker`, `apps/web`                       |
| Web           | Hono API (SSE via `streamSSE`) + React/Vite SPA, Tailwind, shadcn/ui, TanStack Query, dnd-kit |
| DB            | SQLite (`bun:sqlite`, WAL) + Drizzle, shared by web and worker                                |
| Docker        | CLI behind a `ContainerRuntime` interface                                                     |
| Agent         | `claude -p --output-format stream-json` via `docker exec`, `--resume` between steps           |
| GitHub        | Octokit (GraphQL for Projects v2), fine-grained PAT, polling + refresh after own writes       |
| Orchestration | Hand-rolled state machine, persisted runs, semaphore for concurrent agent runs                |

## Process model

- `web` never runs agents. UI actions insert rows into `commands`; the web streams `events` over SSE
  (`Last-Event-ID` = `events.seq`, resumable).
- `worker` polls `commands`, drives each ticket's state machine, runs agents, writes `events`, syncs GitHub.
- Restarting either process never touches running containers.

## Container model (validated by prototype)

- Base image: `claude` CLI, git, Bun; non-root user.
- Host clones the repo into the ticket's workspace volume.
- HOME volume is **writable** and seeded with only the `claudeAiOauth` credential and
  `{"hasCompletedOnboarding":true}`. A read-only HOME breaks `--resume`.
- Containers are stopped between steps (`docker stop`) and started for each step (`docker start` + `docker exec`).
  Volumes survive container recreation.

## Memory

- `feedback_events`: every Revise / final-review feedback (replaces `inbox.jsonl`).
- `lessons`: curated rules per project and agent section, injected into prompts at runtime, editable in the UI.

## Token usage

- Every agent call (ticket steps, side runs, investigations) records its tokens per model in `agent_usage`: input,
  cache reads and writes, output (and its thinking part), web searches, turns, duration, peak context and the
  API-equivalent cost. The CLI's subagent models get their own rows. The CLI reports a resumed session's totals,
  so a call's share is its result minus the session's previous one.
- Shown in the Log (each call's result line, each run's header), the Overview tab's run table (a row opens to its
  calls and models; the side runs and the ticket's total below) and an investigation's Usage tab.
- The cost is what the tokens would cost on the API: a Max subscription does not bill it. It weighs models and
  cached input against each other; it is not a quota.
- `bun run usage:backfill` records the calls already in `agent_log`.

## GitHub mapping

| Local         | GitHub                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| ticket        | issue + Project item                                                                        |
| ticket status | Project `Status` single-select field                                                        |
| step output   | one issue comment per step, found by hidden marker `<!-- union:ticket=<id> step=<step> -->` |
| branch        | `<issue#>-<slug>`, pushed by the host                                                       |
| PR            | draft PR, `Closes #n`                                                                       |
| parent ticket | the child issue is "blocked by" the parent issue (issue dependencies)                       |

GitHub is the source of truth for title, description and status; the local DB owns run state.
