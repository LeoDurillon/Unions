# Updating, backups and data

## Update Union

The sidebar shows **Update (n)** when your checkout is n commits behind `origin/main`; hover it to see their
subjects. The arrow beside it checks again now. Union also checks every 10 minutes.

Click it, read the commits, then **Update and restart**. Union pulls the new commits, reinstalls the dependencies
when they changed, and restarts. The page reloads once Union is back.

- If work is in progress, the dialog lists it and offers **Wait** or **Update anyway**. Updating anyway restarts any
  step in progress from the beginning (which spends Claude usage again) and fails other work in progress. Queued
  work runs after the restart.
- When the update brings database changes, Union backs up the database first, into
  `backups/union-update-<date>.sqlite`. It keeps the 5 newest of those.
- Union only fast-forwards `main`. It refuses to update another branch, a checkout with uncommitted changes to
  tracked files, or one with local commits.
- If the update fails, Union puts the checkout back as it was and keeps running.

The update does not rebuild Union's images or containers. When the commits change files in `docker/` or
`compose.yaml` (the agents' images, for example), run `bun run compose` again after the update to rebuild them.

The Update button needs Docker Compose, which starts Union again after the update. Without Compose, update with
`git pull`, `bun install`, and restart Union yourself.

## Back up and restore

All of Union's state is in one SQLite file, `union.sqlite`, at the root of the checkout. Ticket and preview files
are in `attachments/`.

| Command                     | What it does                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bun run db:backup [file]`  | Copies the database into `backups/`. Safe while Union runs.                                                |
| `bun run db:restore <file>` | Restores a backup. Stop Union first; the current database is saved to `backups/` before.                   |
| `bun run db:reset --yes`    | Starts over with an empty database, and removes the tickets' containers and volumes. Saves a backup first. |

Restoring and resetting refuse to run while Union has the database open; `--force` runs them anyway. `db:reset`
without `--yes` only shows what it would remove. It leaves previews running: stop them first from their Preview tab.
None of them touch GitHub or Notion.

## What Union keeps where

| What                                                                      | Where                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Projects, tickets, outputs, runs, reviews, lessons, settings, credentials | `union.sqlite`                                                           |
| Files attached to tickets, e2e screenshots                                | `attachments/`                                                           |
| Database backups                                                          | `backups/`                                                               |
| A ticket's code and agent session                                         | Container `union-t<id>`, volumes `union-t<id>-home` and `union-t<id>-ws` |
| A preview's containers and data                                           | Compose project `union-t<id>` (or `union-r<id>` for a pull request)      |
| The images the agents run in                                              | Docker images `union-agent:local` and `union-agent-base:local`           |
| A project's own agent image                                               | Docker image `union-agent-p<project id>`                                 |

A ticket's GitHub issue stays the reference for its title and description, and a connected GitHub Project for its
column; Union owns the state of its runs.

Containers and volumes of a ticket, and its preview with the images it built, are removed once its pull request is
merged or the ticket is cancelled, and when you remove the ticket, delete the project or reset the database (a reset leaves the preview). A Done
ticket whose pull request is still open keeps them, so its preview and branch operations still work.
