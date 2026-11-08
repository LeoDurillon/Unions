# Plan: a custom agent image per project

Status: built (2026-11-07, branch `project-agent-image`), steps 1 to 7; checked against real Docker (a build, a
failed check, a failed build, a ticket container from the built image, the cleanup), and the settings page
seen in a browser since. Decisions taken: the Dockerfile is a project setting (not a file in the repository), it extends the
base image (`FROM union-agent`), and saving it builds and checks it right away. Only an image that built and passed
the check is applied; a failed save leaves the tickets on the previous image.

Changed while building:

- The state is a table of its own, `agent_images` (one row per project), not `ProjectConfig.agentImage`: the web
  writes `pending`, the worker `applied`, each its own columns, so a settings save cannot overwrite a build's result.
- No events for the build: its output's tail is in the row (like `container_runs`), and the page polls while it builds.
- No `ARG UNION_BASE`: every `FROM union-agent` is rewritten to the base image's name (`FROM ${ARG}` drew a
  BuildKit warning); the tag's hash still covers the base image's id.
- One command, `sync_agent_image`: build what is saved, stop a build no longer wanted (a newer save, a discard), or
  remove the images of a deleted project.
- "Use the default image" is a save of `{ kind: 'default' }`: applied at once, the built images removed.
- Investigations of the project run on its image; ticket drafts, the lesson and prompt writers and the connector
  check keep the base image (no repository work).

## Problem

Every agent container runs `union-agent:local` (`UNION_AGENT_IMAGE`, `defaultProvisionConfig()` in
`apps/worker/src/provision.ts`): node, Bun, pnpm/yarn, git, the `claude` CLI and Playwright's system libraries. A
project on another stack (Python, Go, Java, Rust, system packages, `uvx` for stdio MCP servers) has no way to give
its agents the tools its install, checks and tests need. The only workaround is to replace the image for every
project at once.

## Decisions

- **The Dockerfile is a project setting, stored in the database.** Reading it from the repository
  (`.union/agent.Dockerfile`) would let an agent change its own sandbox by committing, and would let a fork's pull
  request under review bring a Dockerfile the worker then builds. A file in the repository may come later, read
  from the base branch only and applied after the user approves the change.
- **It extends the base image.** The Dockerfile must start with `FROM union-agent`. The worker builds with
  `--build-arg UNION_BASE=<base image id>` and rewrites that first line to `FROM ${UNION_BASE}`, so the image keeps
  everything Union relies on: the `claude` CLI, git, the uid 1000 `node` user with HOME `/home/node`, `/workspace`
  and `sleep infinity`. A `USER root` for `apt-get` is allowed. The check (below) catches a Dockerfile that ends on
  another user.
- **Saving builds.** The editor's button is **Save and build**. The web saves the text as pending and queues a
  `build_agent_image` command; the worker builds, checks and applies it, and streams the log as events. The save
  request does not wait for the build.
- **Only a good image is applied.** The project keeps two values: the applied Dockerfile with its image tag, and
  the pending one. A failed build or check leaves the applied one in use; the editor keeps the pending text so it
  can be fixed.
- **Tags by content.** `union-agent-p<projectId>:<hash>`, where the hash covers the Dockerfile and the base image's
  id. An unchanged Dockerfile whose tag exists applies without building. Rebuilding `union-agent:local` changes
  the hash, so the next ticket that needs the image builds it again (a lazy build, see step 4).
- **No build context, no secrets.** The Dockerfile goes over stdin (`docker build -`): no repository file and no
  project secret is copied into the build. `COPY` therefore cannot be used; `RUN` with network access can.
- **A pre-built image** (`ghcr.io/org/image:tag`) is a second mode: saving pulls it and runs the same check. It
  must also be built on `union-agent` (the check verifies the result, not the `FROM`).

## Data

`ProjectConfig.agentImage` (`packages/core/src/schema-types.ts`), absent meaning the default image:

```ts
type AgentImageSource = { kind: 'dockerfile'; dockerfile: string } | { kind: 'image'; ref: string };

type AgentImageConfig = {
  /** What tickets run on: built and checked. Absent: the default image. */
  applied?: AgentImageSource & { tag: string; appliedAt: string; sizeBytes: number | null };
  /** Saved but not built yet, building, or failed; cleared once applied. */
  pending?: AgentImageSource & { savedAt: string };
};
```

The build's state and log are events, not config: `agent_image_build_started`, `agent_image_build_log` (lines,
batched), `agent_image_build_finished` (`ok`, `tag`, `error`), declared in `packages/core/src/event-payloads.ts`.
The settings page reads the last build from them.

## Flow

1. **Save and build** (web): validate the text (not empty, first instruction `FROM union-agent`, a size limit),
   write `agentImage.pending`, insert a `build_agent_image` command for the project. A command already queued or
   running for the project is cancelled first (the latest save wins).
2. **Build** (worker, `apps/worker/src/agent-image/build.ts`): compute the tag; if it exists, skip to the check.
   Otherwise `runtime.buildImage(...)`, its lines sent as `agent_image_build_log` events, stopped by the command's
   `AbortSignal` (Cancel, or a newer save).
3. **Check** (`agent-image/check.ts`): in a throwaway container of the new tag, `claude --version`,
   `git --version`, `id -u` is 1000, `$HOME` is `/home/node` and writable, `/workspace` exists. Any failure fails
   the build with the command and its output.
4. **Apply**: write `applied` (tag, time, size from `docker image inspect`), clear `pending`. Stopped ticket
   containers move onto the new image at their next step: `create()` in `docker-cli.ts` already recreates a stopped
   container from a newer image on the same volumes. A running step finishes on the old one.
5. **Use** (`agent-image/resolve.ts`, `agentImageFor(db, runtime, project)`): the applied tag, or the default
   image. When the applied tag is missing (pruned, or the base image rebuilt and the hash changed), the worker
   builds the applied Dockerfile first; if that fails, the step fails with the build log and no silent fallback to
   the default image.

## Steps

1. **Runtime.** `buildImage({ tag, dockerfile, buildArgs, signal }): AsyncGenerator<string, ExecResult>`,
   `imageExists(tag)`, `imageSize(tag)`, `pullImage(ref, signal)` and `removeImage(tag)` on `ContainerRuntime`
   (`packages/core/src/runtime.ts`), implemented in a new `packages/core/src/docker-images.ts`
   (`docker-cli.ts` is at 285 lines). Tested against real Docker with a two-line Dockerfile, the image removed
   after.
2. **Config and validation.** The types above, a pure `parseAgentDockerfile` (first instruction, rewrite to
   `${UNION_BASE}`, limits) and `agentImageTag` (the hash) in core, with tests.
3. **Command, build and check.** The `build_agent_image` command, its handler (build, check, apply), the events,
   cancellation of an older build. Tests with a fake runtime; one run against real Docker.
4. **Use the image.** Replace `config.image` with `agentImageFor` in `provision.ts`, `throwaway-container.ts`,
   `review-agent-setup.ts`, `review-checkout.ts` and `agent-review-target.ts`, with the lazy build. Previews keep
   their own image.
5. **Settings page.** An **Agent image** page in the project settings: Default / Dockerfile / Existing image; the
   editor pre-filled with `FROM union-agent` and a commented `apt-get` example; **Save and build**, **Cancel**; a
   status line (Building… / Applied, with time and size / Build failed, not applied: tickets keep the previous
   image); the live log, folded once applied; **Use the default image** to go back. A component per part and a
   hook for the build's state (lint limits).
6. **Cleanup.** The janitor removes `union-agent-p<id>:*` tags that are neither applied nor used by a container;
   deleting a project removes its images.
7. **Docs.** `documentation/settings.md` (the page, what the Dockerfile may do, `COPY` not available),
   `documentation/troubleshooting.md` (a failed build, a missing tool), `docs/spec/stack.md` (container model),
   `docs/architecture/agents.md` and `worker.md`.

## Later

- Build secrets (a private npm or pip registry) through `docker build --secret`, from the project's secrets, so
  they never land in a layer.
- Previews built on the project image.
- A Dockerfile in the repository, read from the base branch and applied after approval.
- A build context (files the user uploads with the Dockerfile) if `COPY` turns out to be needed.

## Risks

- A build runs arbitrary `RUN` steps with the host's Docker: the same trust as the user's own Dockerfile, which is
  why it is never taken from the repository or a pull request.
- Large images and slow builds: the tag by content avoids rebuilds; the size is shown on the page.
- A base image rebuild makes every project's next ticket build its image first: the step's Log says so.
