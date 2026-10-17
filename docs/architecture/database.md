# Database

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

- `bun run usage:backfill`: records the token usage (`agent_usage`) of the agent calls already in `agent_log`;
  idempotent. `DB_PATH` points it at another file (a backup copy).
- `bun run db:backup [file]`: consistent copy of the database (`VACUUM INTO`, safe while running) into
  `backups/` (gitignored). `bun run db:restore <file> [--force]`: refuses while web or worker has the database open
  (host processes or compose services), saves the current database to `backups/union-before-restore-*`, then
  rebuilds the target from the backup (never a plain file copy: in WAL mode recent data lives in `-wal`).
- `bun run db:reset --yes`: empty database with every migration applied. Without `--yes` it only prints what would go.
  Same in-use refusal as restore, backup to `backups/union-before-reset-*` first, and it removes the agent
  containers and volumes of the deleted tickets (ticket ids restart at 1, so `union-t1` would otherwise be reused).
  GitHub and Notion are not touched.
- After editing `packages/core/src/schema.ts`: `cd packages/core && bunx drizzle-kit generate`. Commit the migration.
  The running web and worker reload on schema changes and apply new migrations to `union.sqlite` at once, so never
  regenerate or rewrite a migration once a dev server has run it: add a new one instead.

Both apply migrations at start (`migrateDb`). It replaces drizzle's migrator, which reads what is applied before
locking and let web and worker apply the same migration when they started together: `migrateDb` takes the write
lock first (`BEGIN IMMEDIATE`), so the second process waits and finds nothing left (`db.test.ts` races four).

Web and worker must open the same SQLite file. The default is `union.sqlite` at the repository root (an absolute
path computed in `packages/core/src/db.ts`), whatever directory a process starts from; `DB_PATH` overrides it for
both.
