# Plan: code quality, after knip, ast-grep, jscpd and gitleaks

Status: planned (2026-10-23), decisions to confirm. Built before it: knip, ast-grep (14 rules), jscpd and gitleaks in
`bun run check`, a husky pre-commit hook, `RunPool` and `inThrowaway` in the worker (commits `2a4e22e` to `a3e9435`).

## Problem

The server side is well covered and the static checks are strict, but some gaps are left:

- The React client is mostly untested, and nothing stops new untested code anywhere.
- The architecture rules about who may import what (web, worker, client, core) are only written in AGENTS.md.
- High line coverage of the state machine does not show its tests would catch a wrong transition.
- Several files sit at the 300-line limit, so the next feature in them forces a split mid-task.

## Today

Measured on `main` at `a3e9435` with `bun test --coverage` (Bun lists only the files some test imports):

| Area                | Source files | Never loaded by a test | Avg. lines covered (loaded files) |
| ------------------- | ------------ | ---------------------- | --------------------------------- |
| `packages/core/src` | 122          | 3                      | 95.5%                             |
| `apps/worker/src`   | 167          | 10                     | 87.4%                             |
| `apps/web/src`      | 110          | 10                     | 87.8%                             |
| `apps/web/client`   | 329          | 285                    | 60.9%                             |

All loaded files: 82.72% of functions, 87.09% of lines. Among the least covered server files:
`apps/web/src/github-onboarding.ts` (10%), `apps/web/src/github-rule-choices.ts` (0%),
`apps/worker/src/github/octokit-project-fields.ts` (10%), `apps/worker/src/implement-run.ts` (19%),
`packages/core/src/docker-cli.ts` (3%, checked against real Docker instead, `docs/architecture/testing.md`).

No `as unknown as` outside tests. Files within about 30 lines of the 300-line limit (non-blank, non-comment lines):
`apps/web/src/api-types.ts`, `packages/core/src/schema.ts`, `apps/web/src/routes/preview-settings.ts`,
`packages/core/src/states.ts`, `packages/core/src/agents.ts`, `apps/worker/src/github/octokit-api.ts`,
`apps/worker/src/github/fake-api.ts`, `apps/web/client/lib/api.ts`.

## Steps

### 1. A coverage floor in `check`

- `bunfig.toml`: `coverageThreshold` for lines and functions, set just under today's numbers (a ratchet, raised as
  tests are added). `bun run check` runs the tests with `--coverage`.
- Bun ignores files no test imports, so the floor alone lets new untested files in. A script
  (`scripts/untested-files.ts`) lists the source files missing from the coverage report and fails on any not in a
  committed list of today's (`scripts/untested-files.txt`, the 308 above). A file that gets a test leaves the list;
  a new file needs a test or a reason to join it.
- Leave out what is checked another way: `docker-cli.ts` (real Docker), the client entry and pure-type files.

### 2. Tests for the client's logic

The untested client files are mostly hooks and helpers, testable with `bun test` and a fake `fetch`, without a
browser: `lib/api.ts`, `lib/use-agent-review.ts`, `lib/use-explanations.ts`, `lib/mermaid-render.ts` (its parsing),
the event hub (`lib/event-hub.ts`). Rendering stays with the UI checks (`scripts/ui-check/`). Start with the hooks
that drive commands (start, approve, cancel), where a bug sends the wrong command.

### 3. Import boundaries with dependency-cruiser

`.dependency-cruiser.cjs` and `bun run deps` in `check` (catalog `development`). Rules:

- `apps/web` never imports `apps/worker`, nor the reverse.
- `apps/web/client` never imports `apps/web/src`, `apps/worker` or server-only core modules: tokens and the App key
  never reach the browser.
- `packages/core` never imports from `apps/*`.
- `states.ts` and `stack-states.ts` import only pure modules (a list), stronger than the `pure-state-machine`
  ast-grep rule, which blocks known I/O modules only.
- No orphan modules and no cycles (already `import/no-cycle` in oxlint; keep one of the two).

Check first that it resolves the workspace packages (`@union/core/*` through `package.json` `exports`) and `.tsx`.

### 4. Mutation testing of the state machine

Stryker with its command runner (`bun test packages/core/src/states.test.ts packages/core/src/stack-states.test.ts`),
mutating `states.ts` and `stack-states.ts` only. A survived mutant is a transition the tests do not pin. Slow: run on
demand (`bun run mutate`), not in `check`; record the score here after the first run.

### 5. Split the files at the limit

One step per file, each on its own: `api-types.ts` by area (tickets, reviews, settings), `schema.ts` (tables already
in `schema-*.ts`: move the rest), `states.ts` (one file per group of phases, `transition` dispatching), `agents.ts`
(defaults per agent), `octokit-api.ts` and `fake-api.ts` (by GitHub area, the fake following the real one).

### 6. Smaller ones

- oxlint: its `restriction` category is off. Count what each candidate rule reports before turning it on
  (`no-plusplus`, `no-negated-condition`, `no-nested-ternary` is already on), keep those with few findings.
- Pin gitleaks: it comes from brew and floats. Check its version in the hook and `bun run secrets`, so findings do
  not differ between machines.
- A bundle budget for the client build (mermaid and lowlight are heavy): fail when a chunk grows past a set size.
- A `commit-msg` hook: a length limit for the subject, no `WIP`, the imperative left to review.
- Dependency updates: a scheduled `bun outdated` report, or Renovate on GitHub; the catalogs keep exact versions.

## Decisions to confirm

1. The coverage floor: today's numbers minus a margin, or rounded down to the next 5%?
2. The untested-files list: commit today's 308 and shrink it, or start with the server only (23 files) and add the
   client once step 2 has begun?
3. dependency-cruiser beside `import/no-cycle`: keep both, or let one own cycles?
4. Stryker: worth its setup for two files, or keep it for when the state machine changes next?
5. Renovate (a GitHub app, pull requests on the repository) or a local `bun outdated` report?
