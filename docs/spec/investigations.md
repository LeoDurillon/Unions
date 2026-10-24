# Investigations

A one-off agent run on a custom prompt, outside the ticket pipeline (project bar → **Investigations** tab, next to
**Board**). It creates no ticket and no GitHub issue; the answer stays in Union (`investigations` table).

- **Scope:** `repository` runs on a fresh host clone of the project's repository at its base branch (agent cwd
  `/workspace/repo`); `global` runs with no code (cwd `/workspace`), for general subjects.
- **Run:** the user picks the model and the tools (same list as the agents; `BASE_DENIED` still applies). The web
  inserts the row as `queued`; the worker claims it (`claimInvestigation`), runs `claude -p` once in a throwaway
  container `union-i<id>` with its own volumes, stores the final answer or the error, and removes the container
  and volumes. Investigations share the `UNION_MAX_CONCURRENT` slots with tickets.
- **Status:** queued → running → succeeded | failed | cancelled. Cancel is a `cancel_investigation` command (a
  queued run is cancelled at once, a running one is aborted). Run again re-queues a finished one with the same
  prompt. A run left `running` by a stopped worker is failed at the next start and its container removed.
- **Follow-up:** once answered, the user can ask a follow-up question. The latest question and its answer move to
  `investigations.history` and the run is queued again; the agent gets the earlier questions and answers in its
  prompt (each run is still a fresh container and session, and a repository investigation reads a fresh clone).
  Run again repeats the latest question.
- **Log:** agent output is logged in `agent_log` with `investigation_id`; `/api/events/log?investigation=<id>`
  returns the run's Log (its events and agent output, in order) from a cursor.
- **Ticket:** **Create ticket** on an answered investigation asks for optional context (what the ticket must cover).
  The worker (`TicketDrafter`, driven by the investigation runner, sharing the run slots) writes it in a throwaway
  container `union-i<id>-ticket` from every question and answer plus that context, in the language of the user's
  questions: a title, then the problem, what to change, acceptance criteria and the useful findings. It lands in the
  Backlog (its GitHub issue follows as for any ticket), and the investigation links to it (`ticket_id`); another one
  can be asked afterwards. `ticket_status` is `queued`, `running` or `failed` (with `ticket_error`) meanwhile.
  When the project has a Notion data source, **Also create it in Notion** (`ticket_target` `notion`) makes the worker add a
  page with the ticket's title and description to that data source and link the ticket to it (its origin, `origin_kind` and `origin_id`, so
  the Notion event rules apply). If Notion refuses, the ticket is still created and `ticket_error` says why it has no
  page.
- **Not yet:** resuming the agent's own session on a follow-up, choosing another branch.
