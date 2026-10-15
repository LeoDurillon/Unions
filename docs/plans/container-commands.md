# Plan: run a command in a ticket's container and give its output to the implementer

Status: phases 1 to 3 built (branch `container-commands`): commands typed in the Preview tab, or saved as scripts in
Project settings, run in the workspace, with their output, which can go to the implementer (kept for its next run, or
sent now as a revision). Scripts have no `target` yet (phase 4 adds it). Phase 4 (preview service) not started. The
e2e "Send to agent" still builds its own revision text (moving it is left). Decisions taken (end of file).

## Idea

From the ticket panel, the user runs a command (a saved project script or one typed on the spot) in the ticket's
environment, reads its output, and sends that output to the implementer: right away as a revision, or kept for its
next run. Examples: reproduce a bug (`npm run import -- fixtures/big.ifc`), read the preview's database
(`psql -c 'select …'` in the `db` service), a migration status, a failing script the agent never ran.

## Today

- The worker runs project commands with `sh -lc "<cmd> 2>&1"` in the ticket container, as `node`, in the checkout:
  `installCommand` and `gateCommand` in the implement loop (`gate.ts`, 15 min timeout, last 120 lines), and
  `preview.e2eCommand` on request (`e2e.ts`). There is no "scripts" concept and no command typed by the user.
- The web never execs anything: UI actions insert rows the worker polls (`commands`, side-run tables).
- Output reaches the implementer only as text: `gateFailurePrompt` after red checks, and e2e's "Send to agent",
  which builds the failure text in the browser and posts a normal `revise` (`preview-e2e.tsx`).
- The preview's service containers are reached only through helper containers holding the Docker socket; nothing
  execs into them.

The implementer can already run commands in its own container. What this adds is the user's commands: the ones
the agent did not think of, needs a human to choose, or cannot reach (the preview's services, with their secrets).

## Design

### Where a command runs (target)

1. **Workspace:** the ticket container, in the checkout (`REPO_DIR`), as `node`, with the preview's plain variables
   and `PREVIEW_URL`/`BASE_URL` when the preview runs (as e2e). Same rules as investigations and PR descriptions:
   refused while a step runs, `ensureTicketContainer` first, the container stopped after unless a step started.
2. **A preview service** (later phase): `docker compose -p union-t<id> exec -T <service> sh -lc "<cmd>"`, run by
   the preview helper that already holds the socket. The service has the preview's secrets in its environment, so
   **every secret value is masked in the output** before it is stored or sent (`***`, as `remoteHasBranch` does
   for the token). The agent container still never gets the socket or the secrets.

### Data

`container_runs` (core `schema-container-runs.ts`):

| column                                    |                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`, `ticket_id`                         | cascade on ticket delete                                                                              |
| `target`                                  | `workspace` or `service:<name>`                                                                       |
| `command`, `script_name`                  | the command run; the saved script's name, if any                                                      |
| `status`                                  | `queued`, `running`, `succeeded` (exit 0), `failed` (exit ≠ 0, timeout, error), `cancelled`           |
| `exit_code`, `error`                      |                                                                                                       |
| `output`                                  | ANSI stripped, secrets masked, last 500 lines and at most 64 KB, rewritten every second while it runs |
| `timeout_sec`                             | default 600, at most 1800                                                                             |
| `for_agent`                               | null, `next_run` (kept for the next implement run) or `sent` (already given)                          |
| `created_at`, `started_at`, `finished_at` |                                                                                                       |

Core functions as for the other side runs: `queueContainerRun` (refused while a step runs), `claim…`, `finish…`,
`failInterrupted…`, `markForAgent`, `pendingForAgent(ticketId)`.

Saved scripts: `ProjectConfig.scripts: { name, command, target, timeoutSec? }[]`, edited in Project settings next to
the install and check commands.

### Worker

`ContainerRunner` in `apps/worker/src/container-run.ts`, wired in `side-runs.ts`: one run per ticket at a time,
several tickets in parallel (small `RunSlots`). Exec with `AbortSignal.any([cancel, timeout])`, stream lines into
the row, mask, tail. Cancel through a `cancel_container_run` command, like `cancel_investigation`.

### Giving the output to the implementer

- **Send now** (when the ticket can be revised: final review awaiting, or done): a `revise` whose feedback is the
  user's note, with the run ids attached (`step_outputs.feedback` plus a new `feedback_runs` JSON column). The
  worker builds the block from the stored rows, not the browser, so the text is the masked one and not size-capped
  by a form.
- **Keep for the next run** (any time): marks the run `next_run`; the next implement run (fresh or resumed) gets
  every pending one, then marks them `sent`.
- The prompt section, next to `feedbackPrompt` in `implement-prompts.ts`:

  ````
  # Command output from the user
  The user ran this in <the workspace | the `db` service of the preview> (exit 1, 2026-10-15 14:02):
  $ npm run import -- fixtures/big.ifc
  ```
  <output tail>
  ```
  ````

  The e2e "Send to agent" moves onto the same path, so both share one format.

### Web and UI

- Routes under `/api/tickets/:id/container-runs`: `GET` (list, newest first), `POST` (`{ command | scriptName,
  target }`), `POST /:runId/cancel`, `POST /:runId/for-agent` (`{ mode: 'next_run' | 'clear' }`). Sending now
  goes through the existing `revise` command with `runIds`.
- A **Commands** section in the ticket's Preview tab (it already holds the services' output and e2e): a script
  picker or a command box, the target (Workspace, or a running service), Run; below, the runs with status, exit
  code, duration and a collapsible `<pre>`; per run: Cancel, Run again, Keep for next run / Send to agent (with an
  optional note). Polls while one is queued or running.

### Security

- Commands run with the rights the agent already has (the ticket container holds no GitHub credentials, private
  files stay out of git); the user is the project's owner, as for the install and check commands.
- Preview service runs: secrets masked in the output before storage; nothing new enters the agent container.
- Output is data for the agent, never instructions: the prompt says so, as for issue text.

## Phases

1. Workspace runs: table, migration, core functions, worker runner, routes, the Commands section with output.
2. Give to the implementer: Keep for next run, Send now, the prompt section; e2e moved onto it.
3. Saved scripts in Project settings.
4. Preview service target through the helper, with secret masking.

Tests at each phase: core queue/claim/refusal while running, the runner with a fake runtime (output tail, timeout,
cancel, masking), the prompt section, the routes; a Playwright check of the section with writes stubbed.

## Decisions taken (2026-10-15)

1. Typed commands and saved scripts both.
2. The preview service target comes later (phase 4); the first version runs in the workspace.
3. Both ways of giving the output: sent now as a revision, or kept for the next implement run.
4. A Commands section in the Preview tab.
