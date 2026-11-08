# Plan: a minimal base agent image, and the JavaScript one built on it

Status: built (2026-11-07, branch `agent-image-layers`), steps 1 to 5; step 6 (a real ticket step on the new
default image) left. Changed while building: the Dockerfile check takes earlier stages from any image and requires
the **last** stage to start from a base, so a starter copies its toolchain from the official image
(`FROM rust:1-slim-bookworm AS rust`, then `FROM union-agent-base`). The starters install into system paths only: HOME
is a volume made from the image once per ticket, so what an image puts there reaches only new tickets. Follows
[a custom agent image per project](project-agent-image.md).

## Problem

`union-agent:local` is the only base a project's Dockerfile can start from, and it holds the JavaScript toolchains:
node/npm, Bun, pnpm and yarn, and Playwright's system libraries (most of its 1.1 GB). A Rust, Go or Python project
needs none of them, yet carries them in every ticket's container.

What Union itself needs in a container is less: git, the `claude` CLI, the `node` user (uid 1000) with a writable
`/home/node`, `/workspace` and `sleep` (the check in `apps/worker/src/agent-image/check.ts`). The worker runs no
`node` or `bun` there; the install, checks and e2e are the project's own commands. Node was in the base only because
the `claude` CLI was installed with npm.

## Decisions

- **Two stages of one Dockerfile** (`docker/agent.Dockerfile`):
  - `base` → `union-agent-base:local`: Debian 12 slim, git, ca-certificates, curl, unzip, the `claude` CLI, the
    `node` user and `/workspace`.
  - the last stage → `union-agent:local`, still the default: `base` plus node and npm (copied from `node:22-slim`,
    the same Debian release), corepack (pnpm, yarn), Bun, and Playwright's libraries.
- **The `claude` CLI as its release binary**, not the npm package: downloaded at the pinned version from
  `downloads.claude.ai/claude-code-releases/<version>/<platform>/claude`, checked against that release's
  `manifest.json`, into `/usr/local/bin`. Not the `install.sh` installer: it puts the launcher under `~/.local`,
  which is the HOME volume, where a fresh volume would hide it and an old one would keep a stale version.
  `DISABLE_AUTOUPDATER=1`: the image pins the version.
- **A project's Dockerfile starts from either**: `FROM union-agent` or `FROM union-agent-base` (each rewritten to
  the image the worker has). The tag's hash covers the ids of the bases it uses, so rebuilding one rebuilds only
  the projects on it.
- **The default image stays `union-agent`**: no project changes unless its Dockerfile says so.
- **Starter Dockerfiles** on the settings page: JavaScript extras, Python, Rust, Go and PHP (Debian's PHP 8.2 with
  the common extensions, Composer copied from its image), each on the base it needs.
- **stdio MCP servers** started with `npx` or `bunx` need `union-agent` (or Node in the project's own image): said
  in the guide and the MCP spec.

## Measured (2026-11-07, amd64)

| Image                        | Size    |
| ---------------------------- | ------- |
| `union-agent:local` (before) | 1.15 GB |
| `union-agent-base:local`     | 428 MB  |
| `union-agent:local` (after)  | 1.07 GB |

The `claude` binary is about 240 MB of the base. The starters, built and run as `node` on a fresh HOME volume (a
venv and `uv`, `cargo build`, `go build`, `psql`): Python 543 MB, Go 913 MB, Rust 1.97 GB, JavaScript 1.08 GB; PHP (`composer require` and autoload) 504 MB.

## Steps

1. **Dockerfile**: the two stages; checked by hand: `claude --version`, git, uid 1000, a writable HOME and no node in
   the base; node, npm, npx, corepack, pnpm, yarn, bun, bunx and the browser libraries in the default.
2. **Build both**: compose's `agent-image` service builds the base (`target: base`) and a second service the
   default; the README, the installation guide and troubleshooting give both commands.
3. **Worker**: `UNION_AGENT_BASE_IMAGE` (default `union-agent-base:local`) beside `UNION_AGENT_IMAGE`; the
   Dockerfile check accepts both names, `buildableDockerfile` rewrites each, `agentImageTag` hashes the bases used.
4. **Settings page**: the starters; the hint says which base has what.
5. **Docs**: the guide's agent image section, settings (the new variable), the spec's container model, the MCP spec,
   `docs/architecture/agents.md`.
6. **A real run** on the new default image (a ticket step with Claude): asked first, it uses the subscription.

## Risks

- The `claude` release binary instead of the npm package on the default image: same version, but a different
  build. `--version` and `mcp list` are checked without Claude; a real step is step 6.
- The release download needs `downloads.claude.ai` at build time (the npm registry before).
- Rebuilding `union-agent:local` changes its id: every project Dockerfile on it is built again at its next ticket
  (already handled by `imageFor`).
