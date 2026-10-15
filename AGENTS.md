# AGENTS.md

union-next: a local Kanban over a GitHub Project. Moving a ticket to In Progress spawns a Docker container that runs
an agent pipeline on the project's repo with the user's Claude Max subscription. Read `SPEC.md` before changing
behavior; this file covers how to work in the repo.

## Where things are

Read the file for the area you change before changing it, and keep it current when behavior changes:

- `packages/core`: shared code: schema and migrations, the pure state machine (`states.ts`), default agent prompts
  and models (`agents.ts`: change a default there, not in the worker), the `ContainerRuntime` interface.
  → `docs/architecture/core.md`
- `apps/web`: Hono API (`src/routes/`) and the React SPA (`client/`), one Bun process in production.
  → `docs/architecture/web.md`
- `apps/worker`: drains `commands`, drives the state machines, runs agents, previews and side runs, syncs GitHub.
  → `docs/architecture/worker.md`
- GitHub and Notion access, credentials → `docs/architecture/integrations.md`
- Database file, migrations, backup/restore/reset → `docs/architecture/database.md`
- `docker/agent.Dockerfile`: the agent image (`union-agent:local`, build with
  `docker build -t union-agent:local -f docker/agent.Dockerfile docker`).
- Plans and ideas not built yet: `docs/plans/README.md`.

To find a file, read the map of its area in `docs/map/` (`core`, `web-server`, `web-client`, `worker`, `scripts`):
one line per file, from the file's own top comment. Then search (`grep -rn`) and read only the lines you need.
Every source file starts with a one-line `//` comment saying what it is for; write it for new files and keep it true
when a file's purpose changes. `bun run map` regenerates the maps; `bun run check` fails when one is out of date or a
file has no summary.

## Commands

- `bun install`
- `bun test`: runs all tests.
- `bun run check`: format check, map check, lint, typecheck and tests, in that order. Run it before finishing; it
  must pass.
- `bun run map`: regenerates `docs/map/` after adding, removing or re-describing files; `bun run map:check` (part of
  `check`) fails when a map is out of date or a source file has no top comment.
- `bun run active`: says whether anything runs on the live instance (exit 1 if so); see "Working on the live
  instance".
- `bun run lint` (`lint:fix` to autofix), `bun run fmt` (`fmt:check` to verify), `bun run typecheck`.
- `bun run dev`: web (Vite on 5173 + API on 3000) and worker together, with reload. `bun run dev:web` /
  `bun run dev:worker` run one side.
- `bun run compose` (`docker compose up --build`; `compose:down` stops it, `compose:logs` follows the logs): the same dev stack in containers, on
  http://localhost:5173. See the header of `compose.yaml` for the overrides (`DOCKER_GID`, `UNION_UID`, ports). The
  worker uses the host Docker socket; agent containers run beside the stack, not inside it.
- `bun run start`: builds the client, then runs the production web server (port 3000) and the worker together.
- `bun run lint:changed`: lint only the TypeScript files changed since the last commit (and new ones): use it while
  working, then `bun run check` once at the end.
- Database scripts (`db:backup`, `db:restore`, `db:reset`) and migrations: `docs/architecture/database.md`. After
  editing the schema: `cd packages/core && bunx drizzle-kit generate`; never rewrite a migration a dev server ran.

## Working on the live instance

The user's Union runs from this checkout: the compose stack (`web` on 5173, `worker`) runs `bun --watch` on these
files and uses `union.sqlite` here, which holds the user's real projects.

- Saving a worker or core file reloads the worker and restarts the agent runs in progress. Run `bun run active`
  first (exit 1 when something runs) and wait, or ask, when it reports runs.
- After edits to several core files, or a new migration: `bun run active`, then `docker compose restart web worker`
  (`--watch` can keep a half-edited import graph).
- Never write to `union.sqlite` by hand, nor reset or restore it, unless the user asks. Read it with `bun:sqlite`
  (`new Database(path, { readonly: true })`; there is no `sqlite3` CLI). Change settings through the API, and check
  the diff after.
- Ask first before anything that acts on GitHub for a real project (push, PR, comment, review, Project status), and
  before anything that uses the user's Claude usage (starting a ticket step, an investigation, an agent review).
- Tests against real Docker use ticket id 9001 and clean up after (`docs/architecture/testing.md`); UI checks block
  every write (`scripts/ui-check/`).
- Never print, copy or write secrets (tokens, the GitHub App key, Claude credentials, preview secrets).
- Commit only when asked.

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
- GitHub: all writes for tickets (issues, comments, Project status, push, PR, posting a review) happen in the worker.
  The web server only reads what the UI needs answered right away, through `OnboardingGitHub`
  (`src/github-onboarding.ts`). Containers never hold GitHub credentials. Resolve credentials with
  `projectGitHubAuth` and build clients with `@union/core/github-client`; never build an Octokit from a token by
  hand. Tokens and the App's key never reach the browser (`toPublicProject`). Details:
  `docs/architecture/integrations.md`.
- Notion is read only, from the web server (`src/notion.ts` behind `NotionApi`); its secret never reaches the browser
  (`hasNotion` only). Details: `docs/architecture/integrations.md`.
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
- `events` is append-only. Do not update or delete rows. Every event type and its payload is declared in `packages/core/src/event-payloads.ts`;
  read rows with `isEvent`.
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

## Lint limits: design for them

The limits that most often force a rewrite are: 60 lines per function, 300 lines per file, 10 imports per file
(`import/max-dependencies`), complexity 12, 4 parameters. Plan for them before writing, not after the lint fails:

- A React component that grows past a form and a list: split it into a component per part (and a hook for its
  state and mutations) from the start.
- A route or module near 250 lines: put new parsing and checks in a new file (core, when pure) rather than appending.
- A file near 10 imports: put a new concern in its own file instead of adding an import.
- Many branches in one function (`?:`, `??`, `if`): pull a helper out for each group of fields.

## Testing

- Unit-test pure logic (state machine, prompt building, parsing) with `bun test`, files next to the source as
  `*.test.ts`.
- For anything touching Docker or SSE, verify against a real process and say so in your report if you could not.
  Clean up containers and volumes named `union-*` that you create. How: `docs/architecture/testing.md` (real Docker
  with ticket 9001, UI checks with `scripts/ui-check/`).
- Do not claim something works without running it. If a check was skipped, say which.

## Git

Commit messages are short and imperative. Do not commit `*.sqlite*`, `.env` or `dist/`.
