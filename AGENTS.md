# AGENTS.md

union-next: a local Kanban over a GitHub Project. Moving a ticket to In Progress spawns a Docker container that runs
an agent pipeline on the project's repo with the user's Claude Max subscription. Read `SPEC.md` before changing
behavior; this file covers how to work in the repo.

## Layout

- `packages/core`: shared code. `agents.ts` holds the default agent prompts and models; edits made in the UI's
  Agent settings are stored in `agent_configs` (overrides only, Reset deletes the row) and the worker resolves them
  on every run (`resolveAgent`, `modelFor`). Change a default there, not in the worker.
  Drizzle schema and migrations, the pure ticket state machine (`states.ts`), ticket dependencies
  (`ticket-links.ts`: `setParent`, `ticketBase`; the start gate `blockingParent` is in `tickets.ts`), the
  `ContainerRuntime` interface and its Docker CLI implementation.
- `apps/web`: Hono API and React/Vite SPA, served by one Bun process in production.
  - `src/app.ts` is `createApp(db)`; routes live in `src/routes/` (`projects`, `tickets`, `events`); `src/server.ts`
    only wires the DB and `Bun.serve`. `src/api-types.ts` holds the response shapes shared with the client.
  - Setup is a wizard (`components/onboarding/`: Connect, Repository, Project, Notion, Review) shown over the board
    on first run and from "Add project". Connect takes a token or an installation of the GitHub App
    (`components/github-app/`, also a global page in the sidebar). The board columns fill the viewport height; each column scrolls itself.
  - Code review: after each implementation run the worker stores the branch diff (`diff-snapshot.ts`,
    `diff_snapshots`/`diff_files`, newest only). The web reads it from SQLite (`routes/review.ts`), never from Docker or
    GitHub; `components/review/` renders one file at a time. Line comments are drafts in `review_comments` until sent;
    sending formats them (`review-feedback.ts`) into a normal `revise` command. Files matching the project's
    review ignore rules (`isIgnoredPath` in `@union/core/diff`: built-in lock files plus `config.reviewIgnore`
    gitignore-style patterns) are flagged `ignored` and listed apart, never dropped. `@union/core/diff` parses diffs and
    is browser-safe.
  - `client/` is the SPA: Tailwind v4, TanStack Query, dnd-kit. `app.tsx` is the shell, `components/` the UI,
    `lib/` the hooks and the typed `api.ts`. The board and ticket panel refetch on SSE events
    (`use-live-invalidation.ts`); the Log tab replays and follows one ticket's `agent_event`s.
  - Dev: `bun run dev:web` (Vite on 5173 proxies `/api` to Hono on 3000). Production: build, then start (below).
- `apps/worker`: long-running Bun process. Drains the `commands` table, drives state machines, runs agents,
  syncs GitHub, writes `events`.
  - `commands.ts` maps UI commands to state-machine actions; `scheduler.ts` runs one step per ticket with a
    concurrency cap through an injected `StepExecutor`; `executor.ts` is the real one (planning steps only so far).
  - `implement.ts` / `implement-loop.ts`: the implementation step. The host checks out the ticket branch
    (`branch.ts`, `workspace-git.ts`), runs the project's install command, then loops agent turn → leftover commit →
    check command (`gate.ts`), resuming the same session with the failure until green or `maxIterations`.
    `publish.ts` exports the branch as a git bundle, pushes it from the host with the project token and opens the
    draft PR. The agent may run shell commands but never push, switch branches or rewrite history.
  - `review.ts`: the final review (fresh session, read-only tools plus git reads, one git command per call because
    permission rules cannot match `&&`). Changes asked at the review go to the implementer through the `thenRun`
    chain in `states.ts`; `revision.ts` hands it the review's feedback. `runResumable` (agent.ts) restarts in a fresh
    session when a resumed one is gone (rebuilt HOME volume).
  - `provision.ts` creates a ticket's container, seeds credentials, and clones the repo on the host with the
    project's token, resetting `origin` to the token-free URL before copying it in; `agent.ts` runs
    `claude -p` in it and parses stream-json; `prompts.ts` builds the step prompts.
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
  GitHub App's installations (`/api/github/app`), and looking up a pull
  request a user links to a ticket (`src/github-onboarding.ts`, behind the `OnboardingGitHub` interface so tests
  use a fake).
- Notion (read only, from the web server): verifying a project's integration secret and data source, and importing
  a page of that data source as a ticket (`src/notion.ts` behind `NotionApi`, `routes/notion.ts`). Uses API version
  `2026-03-11` and `GET /v1/pages/{id}/markdown`. The secret is stored in `projects.notion_token` and never sent to
  the browser (`hasNotion` only). Pages outside the configured data source are refused.
- A project reaches GitHub with a token (`projects.github_token`) or an installation of the GitHub App
  (`projects.github_installation_id`; the app's ID and private key are one row of `github_app`). Both are stored in
  plain text (local single-user app, like the original Union) and never reach the browser: responses use
  `PublicProject` / `toPublicProject` (`githubAccess` only) and the app status omits the key. Resolve credentials
  with `projectGitHubAuth` (`@union/core`; installation wins, then token, then `GITHUB_TOKEN`) and build clients
  with `@union/core/github-client`: clients are cached per credential so an installation token is minted once an
  hour, and git gets a fresh token (`gitToken`) right before each clone or push. Never build an Octokit from a
  project's token by hand.
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
