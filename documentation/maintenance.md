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

The Update button needs Docker Compose, which starts Union again after the update. Without Compose, update with
`git pull`, `bun install`, and restart Union yourself.

## Back up and restore

All of Union's state is in one SQLite file, `union.sqlite`, at the root of the checkout. Ticket and preview files
are in `attachments/`.

| Command                     | What it does                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bun run db:backup [file]`  | Copies the database into `backups/`. Safe while Union runs.                                               |
| `bun run db:restore <file>` | Restores a backup. Stop Union first; the current database is saved to `backups/` before.                  |
| `bun run db:reset --yes`    | Starts over with an empty database, and removes the agents' containers and volumes. Saves a backup first. |

Restoring and resetting refuse to run while Union has the database open. `db:reset` without `--yes` only shows what
it would remove. None of them touch GitHub or Notion.

## What Union keeps where

| What                                                                      | Where                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Projects, tickets, outputs, runs, reviews, lessons, settings, credentials | `union.sqlite`                                                           |
| Files attached to tickets, e2e screenshots                                | `attachments/`                                                           |
| Database backups                                                          | `backups/`                                                               |
| A ticket's code and agent session                                         | Container `union-t<id>`, volumes `union-t<id>-home` and `union-t<id>-ws` |
| A preview's containers and data                                           | Compose project `union-t<id>` (or `union-r<id>` for a pull request)      |

GitHub stays the reference for each ticket's title, description and column; Union owns the state of its runs.

Containers and volumes of a ticket are removed when you remove the ticket, delete the project or reset the database.
A Done ticket keeps them, so its preview and branch operations still work. To free disk space, cancel and remove
tickets you no longer need.
