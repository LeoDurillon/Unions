# Plan: services shared between a project's previews

Status: phase 1 built (commit `ca49236`, 2026-11-10), checked on Senova with `clamav` and `mailhog` shared by two
previews. Phase 2 built (branch `shared-tenants`, 2026-11-10): `config.preview.sharedCommands`, a `create` and a
`drop` command per shared service. Checked with real Docker (two previews on one Postgres, a database each, made at
each start and dropped with the preview's data). Not built from phase 2: Senova's template database (a settings
change, below). Phase 1b built (branch `shared-state`, 2026-11-10): the shared services' state on Environments → Shared, with
Restart and Stop (`shared_stacks`, migration 0085). Phase 3 planned.

## Problem

Each preview is its own compose project (`union-t<id>`, `union-r<id>`), so each one runs its own copy of every
service in the repository's compose file. Some of those services are utilities that every preview could use:
Senova's `clamav` (it loads its whole signature database in memory, more than a gigabyte), `mailhog`, `s3` (MinIO)
and `db` (Postgres). With three previews running, the machine holds three of each, and each preview restores,
migrates and seeds its own Postgres.

## Design

A project picks, in project settings → Previews → Services, the compose services **shared between previews**
(`config.preview.sharedServices`). Union runs them once per project, as their own compose project
`union-p<projectId>-shared` with their own volumes, and every preview of the project uses them.

### Networking: the shared containers join each preview, never the other way round

Joining every preview to one shared network would bring back what `preview-proxy-network.ts` exists to prevent:
compose gives each service its name as an alias on every network it joins, so preview A's `api` would answer as `api`
in preview B too. Instead, as the proxy does, the **shared containers join each preview's networks**
(`docker network connect --alias clamav union-t41_default union-p1-shared-clamav-1`) and leave them before its `down`.

- In the preview, `clamav:3310` and `db:5432` answer as before: the repository's settings and the preview's variables
  do not change.
- Two previews still share no network. The shared containers are on several, but they route nothing.
- The ticket's container joins its preview's networks already, so it reaches them there; for the agent's services
  (below) it joins the shared project's network, where only shared containers and tickets' containers are.

The preview's file is written without the shared services (`splitShared` in core): their definitions move to an
`x-union-shared` extension of the file (compose ignores `x-` keys), the remaining services' `depends_on` on them is
dropped, and a preview starts with `up --no-start` (networks and containers made), the shared stack brought up
(`up -d --wait --no-recreate`: healthy before the preview's services start, running ones left alone) and joined,
then `up -d`.

### What can be shared

Refused with the reason, at the start: a shared service that is exposed by the proxy, builds an image (it would
build from one ticket's code), mounts the repository, depends on a service that is not shared, or that another
service reaches through `network_mode: service:…`, `volumes_from` or `links`. Its named volumes become the shared
project's (`union-p<id>-shared_<name>`). Its published ports are kept (`x-union-ports`) for the agent's `localhost`
forwards. It gets the same memory and CPU caps as preview services, never Union's env file (no preview's
variables, no secrets): its own `environment` as the repository's file resolved it is all it gets.

### Whose definition runs, and who may share

The stack runs from the definition of the preview that first starts it; a later one with a different definition
(another branch) uses the running stack as it is (`--no-recreate`). Phase 3 warns about the difference.

Only code the project trusts starts or joins the stack: tickets, and pull requests under review whose commit is on
a branch of the repository (the same rule as the secrets, `source.secrets` in `target.ts`). A fork's pull request
runs its own copies, as today: its code would otherwise define, or reach, containers that sit on trusted previews'
networks.

### Lifecycle

- Started by the first preview (or agent run) that needs it. Released after a preview's `down` and after the agent's
  services pause: when no shared container is on another network than the shared project's, and no ticket's
  container is on that one, the stack goes down, its volumes kept. Docker's state is the truth, so worker restarts
  need nothing; a per-project lock in the worker keeps a start and a release from crossing.
- A preview's Reset, Restart and Stop act on the preview alone; the stack's data stays.
- It does not count towards `UNION_MAX_PREVIEWS` nor the project's limit.
- Removing the setting: the next start runs the services in the preview again; the stack goes down at its next
  release.

### Agent services

`config.preview.agentServices` that are shared are not started in the ticket's project: Union brings the stack up,
puts the ticket's container on its network (`union-p<id>-shared_default`), and forwards their published ports to
the container's `localhost` as before. Phase 1 shares only services without state, so two tickets testing at once
cannot clash. Postgres is phase 2: a repository's `.env.test` names fixed databases (`goreno_test_template`), which
two tickets' tests would share; until each ticket gets its own names, a stateful shared service should stay out of
the agent services.

## Phases

1. **Stateless services** (ClamAV, Mailhog): the setting, `splitShared` and its checks, the shared stack's start,
   join, leave and release, the agent services, the guide and the spec. Most of the memory saved. No migration:
   the stack's state is Docker's. Left for phase 1b: a row for each running stack on the Previews page (needs a
   record the web can read, since the web never asks Docker), with Restart and Stop.
2. **A tenant per preview** (built as `sharedCommands`; `create` runs at each start, so it must be idempotent,
   rather than at a first start Union would have to record): per shared service, a command run in its container at a preview's first start and one
   at its reset and removal (`createdb -T goreno_template goreno_{ticket.id}`, `mc mb local/uploads-{ticket.id}`,
   `dropdb …`), with `{ticket.id}` in the preview's variables (`…/goreno_{ticket.id}`). For Senova: the restore
   and the seed run once into `goreno_template`, each preview's database is a copy (seconds), only `migrate` runs
   per preview. Then S3 and Postgres.
3. **Drift and opt-out**: a preview whose resolved definition of a shared service differs from the running stack's
   says so on its Preview tab; a preview can run its own copy (a ticket's own compose file already can).

## Checks

- Unit: `splitShared` (moved services, dropped `depends_on`, volumes renamed, each refusal), the agent forwards of
  shared services, the release decision.
- Real Docker (ticket 9001, `docs/architecture/testing.md`): two previews on one stack, each reaching `clamav` by
  name and not the other's `api`; the stack goes down after the last stop, its volume kept; an agent run with a
  shared service on `localhost`.
