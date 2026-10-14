# Plan: preview environments

Status: phases 1 to 3 implemented (branch `preview-container-feature`); phase 4 not started. Replaces the single-container design first written in `SPEC.md` (one image, one
start command, one port): that one could not run apps needing a database or a queue.

## Idea

A ticket's work runs as a full environment, built from the repository's own Docker Compose file, served at
`http://<ticket id>.localhost` (one host per exposed service: `http://api.12.localhost`). The user tries the work
there, and the agent can run end-to-end tests against it.

The environment runs straight from the ticket's **workspace volume** (`union-t<id>-ws`, which every ticket already
has: the agent's container mounts it at `/workspace`, with the repository in `/workspace/repo`). No second clone on
the host, no second install, one Docker image cache shared by all tickets, and no privileged container: the agent
never touches Docker.

## Project settings (Preview)

- **Environment variables**, per project. Plain values or secrets (stored like the GitHub token, never sent to the
  browser). Values can use templates:
  - `{service.<name>.url}`: the public address of an exposed service (`http://api.12.localhost`);
  - `{service.<name>.internal}`: its address inside the environment (`http://api:8080`);
  - `{ticket.id}`, `{preview.host}` (`12.localhost`).
- **Compose file path** in the repository (for example `compose.preview.yaml`).
- **Services**, listed by the worker from the compose file: for each, whether it is exposed, on which port, under
  which name (`web` → `12.localhost`, `api` → `api.12.localhost`).
- **App env file** (optional): the path, inside a service, where the variables are given as a file (`/app/.env`,
  `/app/apps/web/.env.local`), for apps that read their configuration from a file (frontends often read URLs at build
  time).
- **E2E command** (optional, see "End-to-end tests").

## How a preview starts

Available once the ticket has a workspace (its first implementation run created it).

1. **A helper container runs compose.** The worker starts a short-lived `union-t<id>-compose` container from the
   official Docker CLI image (pinned version, with the compose plugin). It mounts the ticket's workspace volume and
   the Docker socket, and runs every compose command from `/workspace/repo`. Only this helper sees the socket; the
   agent's container never does. Compose calls go through `ContainerRuntime` (new compose methods built on the
   helper), as AGENTS.md requires.
2. **Resolve, never parse by hand.** `docker compose config --format json` in the helper gives the resolved file
   (includes, `extends`, `${VAR}` interpolation, profiles). The services list in the settings comes from it.
3. **Check it (safety).** The compose file comes from the workspace, and the agent can edit it: a compose file asking
   for a privileged container, `network_mode: host`, `pid: host`, the Docker socket, devices or added capabilities
   would hand the host to whoever wrote it, a prompt-injected agent included. Any of these refuses the start, with the
   reason. So do external volumes and networks (shared between previews, see "Isolation"), absolute host paths, and
   any mount that leaves `repo/`: the volume also holds `/workspace/attachments`, the ticket's files, some private,
   which a preview must never see.
4. **Write a new file** from the resolved config, not a patched copy of the original:
   - **source mounts**: a relative bind mount (`./src:/app`) would be resolved on the host, where nothing is; it
     becomes a mount of the workspace volume's matching folder (`repo/src`, Docker's volume sub-path mounts, Docker
     Engine 26 or later). The workspace volume is declared external in the generated file (Union created it);
   - **builds**: `build:` contexts stay as they are: the compose CLI sends the context to Docker over the API, so it
     reads from the volume;
   - remove `container_name` and every published host port (`ports:`): Traefik routes the traffic;
   - add Traefik labels to the exposed services, and attach them to the proxy network;
   - the app env file, if set, is given to its service as a compose config with inline content mounted at that path:
     the file exists only inside the service, never in the workspace, so the agent cannot read the secrets in it or
     commit it.
5. **Variables.** The templates are filled in and written to an env file inside the helper (for `${VAR}` in the
   compose file), outside the volume. The generated compose file lives there too.
6. **Up.** `docker compose -p union-t<id> -f <generated file> up -d --build`. Ready when each exposed service
   answers HTTP; failed after a timeout, with the log tail. The helper is removed once the command ends (it is
   started again for stop, restart and logs).

Start, stop and restart are commands handled by the worker (`preview_start`, `preview_stop`, `preview_restart`). The
state (`stopped`, `starting`, `running`, `failed`) is stored on the ticket and streamed as events; `docker compose
logs -f` (in a helper) feeds a **Preview log** tab.

## Which code the preview runs

The agent's working copy, live: where the compose file mounts the source, dev servers with hot reload show the
agent's changes as it makes them, uncommitted ones included. While the agent works that is the point (it can test
in its own edit loop); once the ticket is done everything is committed, so the preview shows the pushed work.
Services built into an image (`build:` without a source mount) show the code as of their last build: restart to
rebuild.

The workspace is shared live between the agent and the preview's services: a service that writes into the source
folder (generated files, a build cache, an install into a mounted `node_modules`) changes the agent's working copy.
Usually harmless (the same platform, so a `node_modules` the agent installed can be reused), but worth knowing. The
leftover commit and the review see such files like any other change.

## Isolation between previews

Each ticket is its own compose project (`-p union-t12`):

- its own containers (`union-t12-db-1`) and network: the app still reaches `db:5432`, but ticket 12's `db` and
  ticket 15's are different containers on different networks;
- its own named volumes (`pgdata` becomes `union-t12_pgdata`): separate data, deleted by `down -v`;
- its own source: relative mounts point into its own workspace volume;
- no host ports, so no clash between tickets or with a database running on the machine.

What would still share a database, and how it is handled:

- external volumes or networks (`external: true`): refused (the workspace volume is the only external one, and
  Union adds it);
- absolute host paths for data: refused;
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
- write e2e tests that work, running one test, fixing it, running it again, against its live working copy;
- debug a failure: rerun one test, read the trace and the browser console, look at the failing step's screenshot;
- run in the same setup as the gate, so "passes for the agent, fails in the gate" mostly goes away.

The cost is the memory of a running Chromium (a few hundred MB, only while tests run).

**E2E gate.** The project's e2e command (for example `npx playwright test`) is run by the worker like the check
command (`gate.ts`): deterministic, the agent cannot skip it. It runs after the agent's last turn, against the
working copy that gets committed and pushed; a failure goes back to the agent with the output, like a failing check.
The Playwright report and failure screenshots are kept on the ticket (Log tab, and readable by the final review).

## Lifecycle

- At most N previews running (default 3).
- A preview keeps running while the agent works (that is how it shows the changes live), and through restarts of the
  agent's container (the volume stays).
- It stops (`down -v`) when the ticket is done, cancelled or removed, and when the worker shuts down; removing the
  ticket's workspace volume requires the preview to be down first. Restart runs `up --build` again from the
  workspace.

## Phase 1 as built

Differences from the design above, decided while building it:

- **The service and port are typed in** the settings; a wrong name fails the start with the list of services the
  compose file has (listing them in the settings needs a worker round trip: phase 2).
- **Previews outlive worker restarts and Done**: their containers do not depend on the worker (under `bun --watch`
  every save restarts it), and trying the work after Done is the main use. A start or stop the worker was running
  when it stopped is marked failed at its next start. A ticket's removal takes its preview down first.
- **The proxy listens on 8080** by default (`UNION_PREVIEW_PORT`): port 80 is often taken or privileged.
- **Logs are read on demand** (`preview_logs`, "Read again"), not followed: following would fill the event log. The
  build and start output goes to the ticket's Log tab, 25 lines per event.
- **A failed start takes down what it started**, after keeping the services' last output.
- **Variables are plain values** stored in the project's settings (the browser sees them); secrets are phase 2.
- **The generated compose file can be read and edited** (ticket Overview → Preview → Compose file). Union saves
  the file it generates (as YAML, without the settings Docker prints as unset) at each Start, or on "Generate"
  without starting anything. An edit is saved as the ticket's own file: Start then runs it instead of generating
  one, so changes to the repository's compose file are not used until "Use the generated file again". The own file
  goes through `docker compose config` and the same checks (Union's workspace volume and preview network allowed
  when they are this ticket's), keeps the ticket's project name, and has its repository mounts turned into
  workspace mounts; host ports in it are published.

## Phase 2 as built

- **Several exposed services**: the settings list them (name, port, host prefix: none → `<id>.localhost`, `api` →
  `api.<id>.localhost`; the first is what "Open" goes to). Phase 1 settings (one `service` and `port`) are read as
  one service with no prefix (`exposedServices`). Each gets its own Traefik router `union-t<id>-<service>`; the start
  waits for all of them, and every address is kept (`previews.urls`).
- **Templates** in variable values, checked on save (`@union/core/preview`): `{service.X.url}` and
  `{service.X.internal}` for exposed services, `{service.X.host}` for any, `{ticket.id}`, `{preview.host}`,
  `{preview.url}`.
- **Secrets** live in `preview_secrets`, written from the settings and never read back (the settings list names). The
  file Docker runs holds the values; the file kept for the panel is built a second time with each secret as
  `${NAME}` (compose prints it `$${NAME}`, turned back into a reference), so an edit saved from it gets the value
  from the worker's environment when it runs. Values Union writes into a compose file keep `$` as `$$`.
- **Variables as a file**: a top-level config with inline `content`, given to one service at an absolute path.
  Compose copies it into the container; a path inside a folder mounted from the workspace is refused, since the copy
  would land in the agent's working copy.
- **Profiles**: the settings choose the compose profiles to enable (`--profile` when the file is resolved, the
  repository's and the user's own); `profiles:` is then dropped from the file that runs, or `up` would leave those
  services out again. Each generation also reads the file with every profile (`--profile '*'`) and keeps its
  catalog (`previews.compose_catalog`: every profile and service), which the settings offer as boxes and chips. An
  exposed service missing because its profile is not enabled says which profile to enable.
- **The services of the compose file** are listed in the settings from the latest file generated for one of the
  project's tickets (no worker round trip): chips add them to the exposed services.

## Phase 3 as built

- **The e2e command is optional** (Preview settings → End-to-end tests).
- **It runs when the user asks**, from the ticket's Preview section ("Run e2e tests"), never on its own: a browser
  and a whole environment take a lot of memory. The implementation loop runs the checks only. Runs are one at a
  time across tickets (a second request records why it did not run), and refused while a step runs on the ticket
  (the agent shares the container). The worker starts the ticket's container for it, starts or updates the preview
  (`up -d --build` rebuilds only what changed), and stops the container again unless a step started meanwhile.
- **Results** stay on the preview (`previews.e2e_*`): passing, failing (output, exit code) or not run (why). Up to 5
  failure screenshots (`test-results/**/*.png`, under 5 MB) become private ticket files named `e2e-<test>.png`,
  replaced by each run (a green run removes them): the agents and the final review read them. A failing run offers
  **"Send the failure to the agent"** at the final review or once done: a normal revision with the output as its
  feedback, like review comments.
- **Red or not run**: a preview the ticket's code breaks (refused compose file, failed build, a service that never
  answers) counts as failing. One that cannot run now (proxy down, running cap reached) is "not run", with the reason.
- **Network**: the ticket's container joins the preview's own networks (not the proxy's shared one) when the preview
  starts and whenever the container is provisioned while it runs, and leaves them before the preview goes down
  (Docker refuses to remove a network a container is still on). The command gets `BASE_URL` and `PREVIEW_URL`: the
  first exposed service from inside the environment (`http://web:3000`).
- **Browser**: the agent image installs Chromium's system libraries (`playwright install-deps chromium`, pinned). A
  run installs the browser with the repository's own `node_modules/.bin/playwright`, into the home volume, once.
  While the preview runs, the agent's prompt says where it answers, and to run only the e2e tests its work touches.

Limit: ticket containers created before the image change keep the old image (no browser libraries) until they are
recreated.

## Phases

1. **Run a preview**: Traefik, the compose helper on the workspace volume, the resolved and rewritten compose file
   (source mounts, no host ports, labels), safety checks, one exposed service, plain environment variables,
   Start/Stop, Preview log.
2. **Variables**: templates (service URLs, ticket id), the app env file as a compose config, several exposed
   services.
3. **End-to-end**: the network join, Chromium libraries in the image and the per-repository browser install, the e2e
   gate, the report kept on the ticket. About half a phase.
4. **Comfort**: setup commands after start (migrations, seeding), auto-stop when idle, the running cap.

## Open questions

- Setup after start (migrations, seeding): commands in the settings, or left to the compose file (an init service)?
- Expose previews on the local network, or this machine only (default)?
- ~~The e2e gate: after every implementation run, or only when the user starts a preview or reaches the final review?~~
  Only when the user asks, from the ticket (phase 3): e2e runs take a lot of memory.
