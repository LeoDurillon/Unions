# Plan: update Union from the sidebar

Status: built (2026-10-21, branch `self-update`), spec in `docs/spec/union-update.md`. Built as planned, except:
the pull runs in `scripts/union-update.ts`, spawned detached by the worker, because the pull reloads the worker
(`bun --watch`) mid-update; web and worker end their containers through PID 1 (compose's init) rather than exiting,
since the web's dev command runs the API and Vite under one shell; the sidebar polls instead of following an event;
the fetch updates `origin/main` itself (no `refs/union/remote-main`). Left: a page open across the restart is
reloaded by Vite's own client as the web comes back, and in headless Chrome inside WSL that reload can land blank
(`ERR_NETWORK_CHANGED` while Docker rewires its network); a manual reload works. Added after (2026-10-21): a database backup before an update that brings migrations
(spec: `docs/spec/union-update.md`).

## Problem

Union runs from this checkout (`compose.yaml`: `web` and `worker` run `bun --watch` on the bind-mounted repo). To get
the latest version the user runs `git pull`, maybe `bun install`, then `docker compose restart web worker`, by hand,
after checking with `bun run active` that nothing runs. An **Update** button in the sidebar does it: it is enabled
when the local commit is not the remote one, and it pulls and restarts the app.

## What the user sees

- An entry in the sidebar under Union settings, like Previews (`previews-button.tsx`): "Up to date" (disabled), or
  "Update available" with the number of commits behind and a dot. Its title lists the remote's commit subjects
  (first 10).
- Disabled, with the reason in its title, when an update cannot run: the working tree has changes, `HEAD` is not on
  `main`, the local branch has commits the remote lacks (no fast-forward), or the app is not under compose (nothing
  would start it again).
- Click → a confirm dialog ("Pull 4 commits and restart Union?") → "Updating…" → the page loses its SSE connection
  while web restarts, then reloads itself when the server answers with the new commit.
- When something runs (the `bun run active` tables), the entry stays enabled, and the dialog lists what runs
  (ticket and step, investigation, agent review, preview, command) with two buttons: **Wait** (closes; the update
  is not queued) and **Update anyway**, in red. Its text says what happens: each step in progress is stopped and
  starts again from the beginning after the restart, which spends Claude usage again; investigations, reviews and
  commands in progress end as failed (interrupted).
- A failure (fetch, conflict, install) shows on the entry with its message; nothing has restarted, the checkout is
  as it was.

## Where it runs

The web app never runs side effects, so the update is a `commands` row (`type: 'union_update'`, no `ticketId`)
handled by the worker, which already has git in its image and owns the clone side of things.

### Checking

The worker checks every 10 minutes (and on a `union_update_check` command, sent by the button's "Check now"):

1. `git rev-parse HEAD`, `git symbolic-ref --short HEAD`, `git status --porcelain` in the checkout (`/app`).
2. `git fetch --quiet origin main` (the checkout's own `origin`, whatever its protocol: see below).
3. `git rev-list --left-right --count HEAD...origin/main` → ahead / behind; `git log --format=%s` of the
   commits behind.
4. Writes the result to a one-row table `union_update` (local sha, remote sha, behind, ahead, subjects, dirty,
   branch, checkedAt, status `idle | updating | failed`, error). A new state, not an event: it is overwritten.

The fetch uses `origin` as the user cloned it, so an SSH clone and an HTTPS clone both work without a second
remote:

- **SSH** (`git@github.com-personal:LeoDurillon/Unions.git` here): the worker mounts the host's `~/.ssh` read-only
  at `/home/bun/.ssh` (`${UNION_SSH_DIR:-~/.ssh}` in `compose.yaml`), so the user's `config` (host aliases such as
  `github.com-personal`), keys and `known_hosts` apply as on the host. The dev image gets `openssh-client`. Read-only
  is enough: the host key is already in `known_hosts` since the user cloned with it; the fetch runs with
  `StrictHostKeyChecking=yes` so an unknown host fails with a clear message instead of prompting. A key with a
  passphrase cannot be used without an agent: then mount `SSH_AUTH_SOCK` instead (a compose override, documented,
  not built first).
- **HTTPS**: works as is for a public repository; a private one needs the user's credential helper, which the
  container lacks, so the check reports the fetch error (not supported in v1).

Only the worker gets the mount, never web and never an agent container (they never see the host's home). The
worker clones projects over HTTPS with their own token (`provision.ts`, `pr-checkout.ts`), so the keys change
nothing for projects; the update fetch is the only `ssh` use. When `~/.ssh` does not exist, Docker would create it
as root on the host: the mount uses the long syntax with `create_host_path: false`, and a user without it sets
`UNION_SSH_DIR` to an empty directory.

The web reads the row (`GET /api/union-update`), and the client refetches it on an `union_update_changed` event
(declared in `event-payloads.ts`).

### Updating

The worker, on `union_update`:

1. Re-checks every condition above (the button's state may be stale). Refuses with the reason if one fails. The
   command carries `force: boolean`: without it, the worker also refuses when something runs (it may have started
   since the dialog opened), and the dialog shows the new list and Update anyway.
2. Sets `status: 'updating'`, stops claiming new commands and new runs (a flag the drain loop reads).
3. `git merge --ff-only origin/main`. Fast-forward only: never a merge commit or a rebase of local work.
4. If `bun.lock` or a `package.json` changed between the two commits: `bun install --frozen-lockfile`. On failure:
   `git reset --hard <old sha>`, reinstall, `status: 'failed'`, resume work. No restart.
5. Writes `union_restart` (`{ from, to }`) to `events`, then exits with code 0 after a short delay (the event is
   flushed).
6. The web sees `union_restart` on its events loop and exits too.
7. Compose starts both again: `web` and `worker` get `restart: unless-stopped`. At start each applies migrations
   (`migrateDb`, which already handles both starting together) and the worker writes the new check.

Why exit rather than `docker compose restart`: the worker must reach Docker only through `ContainerRuntime`, and
restarting its own container from inside it kills the command midway. Exiting under a restart policy needs no
Docker call. It also replaces the `--watch` reload, which can catch a half-written checkout: the processes are new.

The pull itself already makes `--watch` reload both processes before step 5. To avoid a reload racing the exit, the
update writes the files while the processes are about to exit anyway; a reload in between only restarts sooner. If
that turns out noisy, the compose command can drop `--watch` for the files git writes (a later step, not needed).

### The browser

`GET /api/version` returns the commit the web server started on. The client keeps the one it loaded with; when SSE
reconnects and the version differs, it reloads the page (Vite serves the new client).

## Under `bun run start`

Nothing restarts the processes there, so the entry says "Update unavailable: not running under compose" and is
disabled. Compose sets `UNION_SUPERVISED=1`; that is the test. (Supporting `start` would need a supervisor script:
not planned.)

## Code

| Part                                | File                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Pure: parse git output, can-update  | `packages/core/src/union-update.ts` (+ test): reasons a run is refused              |
| Active work, shared                 | move `ACTIVE` from `scripts/active.ts` to core (`active-work.ts`), both use it      |
| Table, migration                    | `union_update` in `schema.ts`, `drizzle-kit generate`                               |
| Events                              | `union_update_changed`, `union_restart` in `event-payloads.ts`                      |
| Worker: check loop, update command  | `apps/worker/src/union-update.ts`, `union-update-git.ts` (git calls)                |
| Worker: pause claims while updating | the drain loop                                                                      |
| Web: read, commands, exit, version  | `apps/web/src/routes/union-update.ts`                                               |
| Client                              | `components/update-button.tsx`, `lib/use-union-update.ts`, version reload           |
| Compose, image                      | `restart: unless-stopped`, `UNION_SUPERVISED`, `~/.ssh` read-only; `openssh-client` |

Spec: a page `docs/spec/union-update.md`; `docs/architecture/worker.md` and `web.md` get a line each.

## Steps

1. Core: parse and refuse (`union-update.ts`), active work shared with `scripts/active.ts` (also lists what runs,
   for the dialog). Tests. Check what each active table does on a worker restart (D4).
2. Worker check loop and the table; `GET /api/union-update`; the button, read only (state and reasons).
3. Update command: fast-forward, install, rollback on failure, exit; web exits on `union_restart`; compose restart
   policy. Verify on a scratch clone in compose, not the live checkout: a commit pushed to a test remote, the
   button, the restart, the new commit served.
4. Client reload on a new version.

## Decisions to confirm

- D1. Where it runs: the worker, with both processes exiting under a compose restart policy (recommended, not
  objected to), rather than a host-side script or the docker socket.
- D2. Remote: `origin` as cloned, with the host's `~/.ssh` mounted read-only into the worker only (chosen
  2026-10-21: an SSH clone then needs no second remote). The cost: any code running in the worker container can
  read the keys, as it can on the host under `bun run dev`; agent containers still never see them.
- D3. Branch: only `main`, fast-forward only (chosen). A checkout on another branch or with local commits cannot
  update.
- D4. Something runs: offer Update anyway (chosen). What a restart does today, and so what the dialog says: at
  start the scheduler marks each `running` run failed (interrupted) and launches again the step of each ticket
  still in a `running` phase (`scheduler.ts`), from the start. Step 1 checks what the other tables (investigations,
  agent reviews, PR descriptions, previews, container runs) do on a restart and words the dialog from that.
- D5. Check interval: 10 minutes, plus Check now (chosen).
