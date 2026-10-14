# Plan: preview environments

Status: designed, not started. Replaces the single-container design first written in `SPEC.md` (one image, one
start command, one port): that one could not run apps needing a database or a queue.

## Idea

A ticket's branch runs as a full environment, built from the repository's own Docker Compose file, served at
`http://<ticket id>.localhost` (one host per exposed service: `http://api.12.localhost`). The user tries the work
there, and the agent can run end-to-end tests against it.

## Project settings (Preview)

- **Environment variables**, per project. Plain values or secrets (stored like the GitHub token, never sent to the
  browser). Values can use templates:
  - `{service.<name>.url}`: the public address of an exposed service (`http://api.12.localhost`);
  - `{service.<name>.internal}`: its address inside the environment (`http://api:8080`);
  - `{ticket.id}`, `{preview.host}` (`12.localhost`).
- **Compose file path** in the repository (for example `compose.preview.yaml`).
- **Services**, listed by the worker from the compose file: for each, whether it is exposed, on which port, under
  which name (`web` → `12.localhost`, `api` → `api.12.localhost`).
- **App env file** (optional): a path in the checkout (`.env`, `apps/web/.env.local`) the variables are written to,
  for apps that read their configuration from a file (frontends often read URLs at build time).
- **E2E command** (optional, see "End-to-end tests").

## How a preview starts

1. **Checkout on the host.** Compose resolves `build:` contexts and bind mounts (`./src:/app`) on the host, and a
   ticket's code lives in a Docker volume, so the worker checks out the ticket's pushed commit under
   `previews/t<id>/` (gitignored, like `attachments/`). In the compose stack the worker runs in a container: the
   previews folder must be mounted at the same path inside the worker as on the host, or Docker will not find it.
2. **Resolve, never parse by hand.** `docker compose config --format json` in the checkout gives the resolved file
   (includes, `extends`, `${VAR}` interpolation, profiles). The services list in the settings comes from it.
3. **Check it (safety).** The compose file comes from the branch, and the agent can edit the branch: a compose file
   asking for a privileged container, `network_mode: host`, `pid: host`, the Docker socket, devices, added
   capabilities, or a bind mount outside the checkout would hand the host to whoever wrote it, a prompt-injected
   agent included. Any of these refuses the start, with the reason. External volumes and networks are refused too
   (they are shared between previews: see "Isolation").
4. **Write a new file** from the resolved config, not a patched copy of the original:
   - remove `container_name` and every published host port (`ports:`): Traefik routes the traffic;
   - add Traefik labels to the exposed services, and attach them to the proxy network;
   - point the env file at the generated variables.
5. **Variables.** The templates are filled in, then written to an env file passed to compose (for `${VAR}` in the
   compose file) and to the app env file if one is set. Both live in the host checkout, never in the branch.
6. **Up.** `docker compose -p union-t<id> -f <generated file> up -d --build`. Ready when each exposed service
   answers HTTP; failed after a timeout, with the log tail.

Start, stop and restart are commands handled by the worker (`preview_start`, `preview_stop`, `preview_restart`).
Compose calls go through `ContainerRuntime` (new compose methods), as AGENTS.md requires. The state (`stopped`,
`starting`, `running`, `failed`) is stored on the ticket and streamed as events; `docker compose logs -f` feeds a
**Preview log** tab.

## Isolation between previews

Each ticket is its own compose project (`-p union-t12`):

- its own containers (`union-t12-db-1`) and network: the app still reaches `db:5432`, but ticket 12's `db` and
  ticket 15's are different containers on different networks;
- its own named volumes (`pgdata` becomes `union-t12_pgdata`): separate data, deleted by `down -v`;
- no host ports, so no clash between tickets or with a database running on the machine.

What would still share a database, and how it is handled:

- external volumes or networks (`external: true`): refused;
- absolute host paths for data: refused (relative paths are per checkout, so fine);
- `container_name`: removed (it would block the second start, not share data);
- a database outside the compose file (`DATABASE_URL` pointing at a shared server): a configuration choice Union
  cannot block; the settings warn about it and suggest `{service.db.internal}`.

Cost: each running preview has its own database (about 50–150 MB of memory each, plus migrations and seeding on first
start), hence a cap on running previews.

## Proxy

A Traefik container in Union's compose stack, on port 80 (configurable, for example `8080` →
`http://12.localhost:8080`). Routes come and go with the labelled containers; WebSockets (Vite HMR) pass through.
Browsers send `*.localhost` to the machine itself, so no DNS setup. Reach: this machine only by default.

## End-to-end tests

**Network.** For a run that needs it, the worker connects the ticket's agent container to the preview's compose
network: the agent reaches services by name (`http://web:3000`). `http://12.localhost` does not work from inside a
container (`localhost` there is the container itself).

**Browser in the agent's container.** The system libraries Chromium needs are installed in the agent image (they
rarely change). The browser itself is installed on first use, at the repository's `@playwright/test` version
(`npx playwright install chromium`), and cached in the container's home volume, so the version always matches the
repository and the image only grows by the libraries. This lets the agent:

- check its own UI changes: open the page, click through the feature, take screenshots and look at them;
- write e2e tests that work, running one test, fixing it, running it again;
- debug a failure: rerun one test, read the trace and the browser console, look at the failing step's screenshot;
- run in the same setup as the gate, so "passes for the agent, fails in the gate" mostly goes away.

The cost is the memory of a running Chromium (a few hundred MB, only while tests run).

**E2E gate.** The project's e2e command (for example `npx playwright test`) is run by the worker like the check
command (`gate.ts`): deterministic, the agent cannot skip it. It runs once the preview is up at the pushed commit;
a failure goes back to the agent with the output, like a failing check. The Playwright report and failure
screenshots are kept on the ticket (Log tab, and readable by the final review).

**Which code the preview runs.** As designed, the pushed commit (host checkout): e2e verifies the work after the
push, at the final review or as a gate before it, not inside the agent's edit loop. A later option: where the compose
file mounts the source (`./:/app`), mount the ticket's workspace volume instead (Docker can mount a volume's
sub-folder), so dev servers with hot reload show the agent's changes as it makes them. Services built with `build:`
still use the checkout.

## Lifecycle

- At most N previews running (default 3).
- A preview stops (`down -v`) when the ticket goes back into implementation, is done, cancelled or removed, and when
  the worker shuts down. Restart re-checks out the latest pushed commit and runs `up --build` again.

## Phases

1. **Run a preview**: Traefik, host checkout at the pushed commit, resolved and rewritten compose file, safety checks,
   one exposed service, plain environment variables, Start/Stop, Preview log. About the size of the whole former
   single-container plan.
2. **Variables**: templates (service URLs, ticket id), the app env file, several exposed services.
3. **End-to-end**: the network join, Chromium libraries in the image and the per-repository browser install, the e2e
   gate, the report kept on the ticket. About half a phase.
4. **Comfort**: setup commands after start (migrations, seeding), auto-stop, the running cap; optionally the live
   workspace mount for hot reload.

## Open questions

- Setup after start (migrations, seeding): commands in the settings, or left to the compose file (an init service)?
- Expose previews on the local network, or this machine only (default)?
- The e2e gate: on every push, or only when the user starts a preview or reaches the final review?
