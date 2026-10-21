# Updating Union

The sidebar's **Update** entry pulls Union's new commits and restarts it. Plan and decisions:
[`docs/plans/self-update.md`](../plans/self-update.md).

## What the user sees

- Under Union settings: "Update (n)" with a dot when the checkout is n commits behind `origin/main`, its title
  listing their subjects (first 10). "Up to date" when it is not, "Update unavailable" (the reason in its title)
  when it cannot update, "Updating…" while it does. The arrow beside it checks again now.
- The worker checks every 10 minutes, at start, and on Check now. A failed fetch or update shows in red under the
  entry until the next check.
- Clicking opens a dialog: the commits, then **Update and restart**. While work is in progress the dialog lists it
  (per kind, with counts) and says what a restart does: a ticket step in progress starts again from the beginning
  (Claude usage spent again); other work in progress ends as failed; queued work runs after. Its buttons are then
  **Wait** and **Update anyway**.
- After the restart the page reloads itself once the update is over (the sidebar's state is `idle` on another
  commit than the page loaded on).

## Rules

- Only `main`, only a fast-forward. Refused: another branch or a detached HEAD, uncommitted changes to tracked
  files, local commits not on `origin/main`, and running outside compose (nothing would start Union again).
- The fetch uses the checkout's own `origin`, as the user cloned it. An SSH remote works through the host's
  `~/.ssh`, mounted read-only into the worker only (`UNION_SSH_DIR`); the fetch never prompts (`BatchMode`, a known
  host key required). Projects still clone over HTTPS with their own credentials.
- An update the user did not force is refused when work is in progress (checked again by the worker, not only by
  the dialog).
- An update whose commits add migrations (`packages/core/drizzle/*.sql`) backs the database up first, before the
  merge: the restart applies them to the live database and putting the code back would not undo them. The copy
  (`VACUUM INTO`, safe while web and worker write) goes to `backups/union-update-<date>.sqlite`, logged as
  `union_update_backup`; the 5 newest update backups are kept, the manual ones (`union-<date>`) are never touched.
  A failed backup refuses the update. The check counts the migrations, and the dialog says a backup comes first.
  Restoring is manual (`bun run db:restore`).
- A failed update (the merge, `bun install --frozen-lockfile` when `bun.lock`, `bunfig.toml` or a `package.json`
  changed) puts the checkout and its packages back on the commit it started from and restarts nothing.
- While an update runs or waits for its restart, the worker starts no new work (commands are still recorded).
  An update that has not moved on for 15 minutes is marked failed and the worker resumes.

## How it runs

1. The web queues `union_update` (`{ force }`) or `union_update_check` in `commands`.
2. The worker checks again, sets `union_update.status` to `updating`, logs `union_update_started` and spawns
   `scripts/union-update.ts <from> <to>` detached: the pull reloads the worker (`bun --watch`), the script must
   outlive that.
3. The script backs the database up when migrations come (`scripts/union-update-backup.ts`), fast-forwards, reinstalls when needed, sets `restarting`, logs `union_restart` (with the worker
   container's init start, in clock ticks), then sends SIGTERM to the container's PID 1 (compose runs it with
   `init: true`) and SIGKILL to its children 30 s later.
4. The web follows the log for `union_restart` and sends SIGTERM to its own PID 1.
5. Compose starts both again (`restart: unless-stopped`); they apply migrations at start. The worker sets the
   status back to `idle` only when its container's init is not the one `union_restart` recorded (a new
   container; a `--watch` reload keeps waiting), then checks again.
