# Plan: the agent services on `localhost`, and which variables the agent's commands get

Status: built (branch `agent-service-ports`), phases 1 to 3. Decisions: the variables setting defaults to `all`
(nothing changes for existing projects; Senova set to `none`); Commands always get the agent's environment. The list
of forwarded ports is shown in the ticket's log (`agent_ports_forwarded`) and the agent's prompt, not in the settings
(it is known only once a ticket's file is resolved). Checked with real Docker: `localhost`, `127.0.0.1` and `::1`
reach Postgres through the forwarder; a taken port is reported, the others work; the same ports reuse the
forwarder, other ports replace it, a killed one comes back; a command on a scratch ticket started the service, reached
it on `localhost`, got only the chosen variables, and stopped it after. Learned: while the service is down the port is
still open, so a client gets a reset (not a refusal) and a port check (`wait-on tcp:5432`) passes too early.

## Problem

Repositories are written for a laptop, where the dev compose file publishes its services on the machine:
`localhost:5432` for Postgres, `localhost:9000` for S3. Their test and dev settings say so (Senova:
`goreno/api/.env.test` has `GORENO_DATABASE_URL=…@localhost:5432/goreno_test_template`, `S3_URL=http://localhost:9000`,
`SMTP_CONNECTION_URL=smtp://localhost:1025`, `CLAMAV_HOST=localhost`).

In Union the agent works in the ticket's container (`union-t<id>`). The agent services
(`config.preview.agentServices`: Senova's `db`, `s3`, `clamav`, `mailhog`) run beside it in the ticket's compose
project, on its network: they answer at `db:5432`, `s3:9000`…, never on the container's `localhost`. So the API e2e
tests cannot reach their database when the agent runs them.

A second problem hides behind the first. For implementation and rebase steps, `withEnvironment` gives every command
in the container the preview's plain variables (`target.plain`), Senova's `GORENO_DATABASE_URL=…@db:5432/goreno`
among them. The tests load `.env.test` with dotenvx, which never overrides a variable already set (dotenvx 1.51.4,
`overload` off by default). So once the network works, the agent's test run would use the preview's `goreno`
database, not `goreno_test_template`, and could change or wipe the preview's data.

Saved scripts as checks or as agent tools do not fix either: they run in the same container. The "Run API E2E"
script works today only because its command spells out `db:5432/goreno_test_template`, and only while the services
are up (the Commands section does not start them; see "Commands" below).

## Today

- `withAgentServices` (`agent-services-step.ts`) wraps implementation and rebase steps: `startAgentServices`
  (`preview/background.ts`) runs `compose up -d <agentServices>`, joins the ticket's container to the network
  (`joinPreview`), and returns `target.plain`; `withEnvironment` adds those variables to every `exec` in the ticket's
  container (agent, install, checks); `pauseAgentServices` stops the services after the step unless the preview runs.
- The compose file that runs has no host ports: `previewCompose` drops `ports` from every service
  (`packages/core/src/preview-compose.ts`, `rewriteService`). The ports the repository publishes are still in the
  resolved file before the rewrite (`resolve` in `preview/compose-file.ts`).
- Each ticket has its own container and its own compose project (`union-t<id>`), so two tickets never share a
  `localhost` or a database. Within one ticket, one step runs at a time; Commands, ticket investigations and PR
  description rewrites are refused during a step; a ticket's agent review is not, and shares the container.

## Design

### 1. Forward the agent services' published ports to `localhost`

**Which ports.** For each agent service, the ports the repository's file publishes on the machine, read from the
resolved file (the generated one or the ticket's own) before `ports` is dropped: `compose config --format json` gives
the long form `{ target, published, host_ip, protocol }`. A forward is `localhost:<published>` → `<service>:<target>`.
Rules:

- TCP only (UDP entries skipped).
- `published` missing (a bare `"5432"`: a random port on the machine) → `localhost:<target>`.
- A range (`"9000-9001:9000-9001"`) → one forward per port.
- `host_ip` is ignored (`127.0.0.1:5432:5432` forwards like `5432:5432`).
- Only agent services, and only services that publish something; the exposed preview services (api, conception…)
  are not forwarded, so the agent can start the app itself on 3000.
- Two services publishing the same port: the first wins, the other is reported (setting check and event).

A pure core function `agentForwards(resolved, agentServices): { forwards, problems }`, tested on Senova's shapes.
`startAgentServices` gets the list from the file it already resolves (`fileToRun`), so nothing new is stored. The
Preview settings show the list under the agent services ("Reachable on localhost: db 5432, s3 9000…").

**The forwarder.** A small Node script (the agent image is `node:22-slim`, so no image change), written by the
worker to `/tmp/union-forward.mjs` in the ticket's container (`runtime.writeFile`) and started detached, like the
command runner's wrapper: `setsid -f node /tmp/union-forward.mjs <spec>`. It:

- listens on **both `127.0.0.1` and `::1`** for every forwarded port (Node resolves `localhost` to `::1` first: a
  forwarder on IPv4 only would still give ECONNREFUSED to `pg` and Prisma);
- opens the connection to `<service>:<port>` only when a client connects, so the services need not be up yet;
- writes its pid and its spec to `/tmp/union-forward.pid` / `.json`, and logs a port it cannot take
  (`EADDRINUSE`) to `/tmp/union-forward.log` instead of dying, keeping the others.

**One forwarder per container.** Starting is idempotent: if the pid is alive and its spec is the same, nothing is
done; a different spec (settings changed) stops it and starts the new one. So a ticket's agent review, which can
share the container with a step, reuses it.

**Lifecycle.** The container stops after each step, killing the forwarder; it is started again:

- in `withAgentServices`, after `startAgentServices`, for implementation and rebase;
- before each check run (`runGate`) and before the install command: if the agent killed it (`pkill node`), it
  comes back (a cheap `kill -0` on the pid file);
- in every other run that starts the agent services (Commands, below).

Nothing stops it explicitly: the container stopping does.

**The agent is told.** The step prompts get one line next to `gateHint`: "The services db, s3, clamav and mailhog
run beside you, reachable on localhost (5432, 9000, 3310, 1025) and by name (db:5432…)." A port that could not be
forwarded is named there too, so the agent does not chase a ghost.

**Failures.** Forwarding never fails a step: a failure is logged as an `agent_services_failed`-like event
(`agent_ports_failed`, with the reason) and the step runs without, as `startAgentServices` already does.

### 2. Which variables the agent's commands get

A setting in Previews → Agent services: **Variables for the agent's commands**.

- `all`: every plain variable, as today (default, so nothing changes for projects that rely on it).
- `none`: no project variable; the repository's own env files apply (with forwarding, `.env.test` and
  `.env.development` then work as on a laptop).
- `chosen`: only the listed names.

Stored as `config.preview.agentVariables?: { mode: 'all' | 'none' | 'chosen'; names?: string[] }`, checked by the
settings route (names must be plain variables of the project). `startAgentServices` returns the filtered map;
`withEnvironment` is unchanged. Secrets never reach the agent, whatever the mode (as today).

For Senova the right choice is `none` (or `chosen` without `GORENO_DATABASE_URL`): the tests then read
`goreno_test_template` on `localhost:5432`, forwarded to the ticket's own Postgres.

### 3. Commands get the same environment as the agent

Today a command from the Commands section runs without the agent services (it reaches `db` only while the preview
runs or right after a step) and with only `PREVIEW_URL`/`BASE_URL`. With this plan, `ContainerRunner.execute`
(`apps/worker/src/container-run.ts`) starts the agent services, the forwarder, and the chosen variables the same way
as a step (shared helper with `withAgentServices`), and stops the services after unless the preview runs or a step
started. Then the "Run API E2E" script becomes `pnpm --filter=api run test:e2e:full`, as on a laptop, and a check or
a script the agent runs behaves the same as the user's run.

## What can go wrong (and the answer)

| Risk                                                      | Answer                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `localhost` resolves to `::1`                             | listen on both addresses                                                                   |
| the agent kills the forwarder                             | restarted before checks and install; `kill -0` on the pid file                             |
| a port is taken in the container                          | that one is skipped and logged, the agent is told; the others work                         |
| two runs share the container (agent review during a step) | one forwarder per container, started idempotently                                          |
| a service is not up yet                                   | connections are opened on demand; refused like `db:5432` would be                          |
| tests create or drop databases on the preview's Postgres  | they already share the server; the variables setting keeps them off the preview's database |
| the agent writes `localhost` into compose config          | the review catches it; the repository's compose already uses names                         |
| UDP                                                       | not forwarded; none of the known services needs it                                         |

No new reach: the container is already on the services' network; forwarding only adds `localhost` as an address.

## Phases

1. Forwarding: `agentForwards` in core (tests on the port shapes), the forwarder script and its start/restart in the
   worker, the prompt line, the list in the Preview settings. A real Docker check on a scratch ticket (`union-t9001`)
   with a Postgres agent service: `psql -h localhost` and `node -e` with `pg` on `::1` from the container, the
   restart after `pkill node`, a taken port.
2. The variables setting: config, route check, settings UI, `startAgentServices` filtering; tests that `none` and
   `chosen` reach the step's `exec` environment.
3. Commands with the agent's environment (shared helper), and the Senova script rewritten to the repository's own
   command.

## Decisions taken (2026-10-15)

1. The variables setting defaults to `all` (today's behavior); Senova uses `none`.
2. Commands always get the agent's environment (no per-project switch).
3. The forwarding can be turned off per project (`config.preview.forwardPorts: false`, "Reach them on localhost" in
   Previews → Services), for repositories whose dev setup already runs in Docker and uses the services' names.
