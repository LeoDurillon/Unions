# Investigations

A one-off agent run on a custom prompt, outside the ticket pipeline (project bar → **Investigations** tab, next to
**Board**). It creates no ticket and no GitHub issue; the answer stays in Union (`investigations` table).

- **Scope:** `repository` runs on a fresh host clone of the project's repository at its base branch (agent cwd
  `/workspace/repo`); `global` runs with no code (cwd `/workspace`), for general subjects; `ticket` runs in the
  chosen ticket's own container, on its workspace as the agent left it (`on_ticket_id`). A ticket investigation is
  refused while the ticket runs a step, and fails if one started meanwhile. It may not write: `Edit`, `Write` and
  the git commands that change the branch are denied (`TICKET_INVESTIGATION_DENIED`), and a workspace that still
  changed during the run logs `investigation_changed_workspace` and adds a warning to the answer.
- **Run:** the user picks the model and the tools (same list as the agents; `BASE_DENIED` still applies). The web
  inserts the row as `queued`; the worker claims it (`claimInvestigation`), runs `claude -p` once in a throwaway
  container `union-i<id>` with its own volumes, stores the final answer or the error, and removes the container
  and volumes. A ticket investigation runs in the ticket's container instead, stopped afterwards unless a step
  started there. Investigations share the `UNION_MAX_CONCURRENT` slots with tickets.
- **Status:** queued → running → succeeded | failed | cancelled. Cancel is a `cancel_investigation` command (a
  queued run is cancelled at once, a running one is aborted). Run again re-queues a finished one with the same
  prompt. A run left `running` by a stopped worker is failed at the next start and its container removed.
- **Follow-up:** once answered, the user can ask a follow-up question. The latest question and its answer move to
  `investigations.history` and the run is queued again; the agent gets the earlier questions and answers in its
  prompt (each run is still a fresh session; a repository investigation reads a fresh clone, a ticket one the
  ticket's workspace as it is then).
  Run again repeats the latest question.
- **Log:** agent output is logged in `agent_log` with `investigation_id`; `/api/events/log?investigation=<id>`
  returns the run's Log (its events and agent output, in order) from a cursor.
- **Export:** **Export** downloads the investigation as Markdown (`investigation-<id>-<title>.md`): title, scope,
  model, tools, status and date, then each question and answer, oldest first (the latest answer replaced by its
  status or error while there is none). Built in the browser from the record the page already has; no API call.
- **Ticket:** **Create ticket** on an answered investigation asks for optional context (what the ticket must cover).
  The worker (`TicketDrafter`, driven by the investigation runner, sharing the run slots) writes it in a throwaway
  container `union-i<id>-ticket` from every question and answer plus that context, in the language of the user's
  questions: a title, then the problem, what to change, acceptance criteria and the useful findings. It lands in the
  Backlog (its GitHub issue follows as for any ticket), and the investigation links to it (`ticket_id`); another one
  can be asked afterwards. `ticket_status` is `queued`, `running` or `failed` (with `ticket_error`) meanwhile.
  A ticket written from a ticket investigation depends on the ticket investigated (its parent, see
  [Ticket dependencies](ticket-dependencies.md)): it starts once that one is done, from its branch. Not when that
  ticket was cancelled or removed.
  When the project has a Notion data source, **Also create it in Notion** (`ticket_target` `notion`) makes the worker add a
  page with the ticket's title and description to that data source and link the ticket to it (its origin, `origin_kind` and `origin_id`, so
  the Notion event rules apply). If Notion refuses, the ticket is still created and `ticket_error` says why it has no
  page. For a project connected to Jira, **Also create it in Jira** (`ticket_target` `jira`) makes the worker create
  an issue in the Jira project (the configured `issueTypeId`, else Task, else the first type, never a sub-task),
  the summary from the title (255 characters at most), the description converted from markdown to ADF (cut with a
  note past 30 000 characters), and link the ticket to it (`origin_kind` `jira`, `origin_id` the key). Jira's
  refusal becomes `ticket_error`, the ticket created all the same.
- **Setup:** an investigation of kind `setup` (`investigations.kind`, `question` otherwise) is the setup agent's
  run, queued by the wizard's "Let an agent set up this project" or **Run setup** on the board
  (`POST /api/projects/:projectId/setup`, `queueSetup`, one at a time per project). A repository run with `Read`,
  `Grep` and `Glob` only, on the model the user picked (Sonnet by default); its prompt (`setup-prompt.ts`) says what
  each setting does and ends with the answer block; the worker copies the user guide (`documentation/`) into the
  container at `/workspace/union-guide` for it to read, and the worker's trailer asks for that block instead of the
  findings layout. `GET /api/projects/:projectId/setup` returns the latest run and its proposal
  (`parseSetupProposal`): every value checked as the settings would, secret values and file contents never kept,
  refusals listed in `dropped`. Plan: [`docs/plans/setup-agent.md`](../plans/setup-agent.md).
- **No Claude login:** any run (an investigation, a ticket step) fails with "Claude is not logged in on this
  machine…" when the credentials file is missing or holds no subscription login.
- **Not yet:** resuming the agent's own session on a follow-up, choosing another branch than the base or a
  ticket's.
