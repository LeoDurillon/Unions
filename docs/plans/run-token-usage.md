# Plan: token usage of each run

Status: steps 1 to 5 built; the live database is backfilled. Left: step 6 (`worker.md`, `SPEC.md`). Decisions taken (end of file).

## Idea

Each agent run says what it consumed: input, cache reads and writes, output (and the thinking part of it), per
model (the main model and the subagents' Haiku), with its turns, duration, peak context and API-equivalent cost.
The Log shows it after each agent call, the Overview tab shows a table per run with the ticket's total, and
investigations show the same. It answers "why did this ticket use so much of my Max quota", "which step costs the
most", and "is the context close to full".

## What exists today

- `runAgent` (`apps/worker/src/agent.ts`) reads the `result` event of `claude -p --output-format stream-json`, keeps
  `total_cost_usd` in `AgentOutcome.costUsd`, and nobody reads it.
- `runs.cost_micro_usd` exists in the schema but is never written (0 of 176 runs on the live database).
- Every stream-json event already lands in `agent_log` through `appendAgentLine` (core), with `runId` for ticket
  steps, `investigationId` for investigations, and only `ticketId` for the side runs (agent review, PR description,
  grouping). `investigation-ticket.ts` drops its events (`onEvent: () => {}`).
- The Log's `result` line says only "finished in 132s" (`apps/web/client/lib/agent-events.ts`).

## What `claude -p` reports (checked on the live `agent_log`)

The final `result` event carries:

- `usage`: **this call only**, main model only: `input_tokens`, `cache_creation_input_tokens` (split 5m/1h in
  `cache_creation`), `cache_read_input_tokens`, `output_tokens`, `output_tokens_details.thinking_tokens`,
  `server_tool_use.web_search_requests` / `web_fetch_requests`.
- `modelUsage`: per model (`inputTokens`, `outputTokens`, `thinkingTokens`, `cacheReadInputTokens`,
  `cacheCreationInputTokens`, `webSearchRequests`, `costUSD`, `contextWindow`), **cumulative over the session**:
  a resumed session (the implementer across revisions, run 8 → 9 → 10) adds to the previous totals.
- `total_cost_usd`: cumulative over the session too, so today's `costUsd` is wrong for every resumed run.
- `num_turns`, `duration_ms`, `duration_api_ms`: this call only.

Each `assistant` event carries `message.usage` for that API turn: its context size is
`input + cache_read + cache_creation`. Several events share one `message.id` (one per content block): count each
message once.

A single run can hold several `claude` calls: the implement loop's fix rounds after a failed gate, the retry in a
fresh session after `union_session_lost` (run 15 has two results). A run killed before its result (cancel, crash)
reports nothing.

## Design

### One row per agent call and model: `agent_usage`

New table in `packages/core/src/schema-agent-usage.ts`:

| column                                                                                |                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                                                                                  |                                                                                                        |
| `result_line_id`                                                                      | the `agent_log` line of the call's `result` event; unique with `model`                                 |
| `ticket_id`, `run_id`, `investigation_id`                                             | the owner, copied from that line                                                                       |
| `session_id`                                                                          | the Claude session                                                                                     |
| `model`, `main`                                                                       | `claude-opus-5-5`, `claude-haiku-5-5`…; `main`: the model of the call's own turns (not its subagents') |
| `input`, `cache_read`, `cache_write`, `output`, `thinking`, `web_searches`            | this call's tokens for this model                                                                      |
| `cost_micro_usd`                                                                      | API-equivalent, not billed on Max                                                                      |
| `turns`, `duration_ms`, `api_duration_ms`, `peak_context`, `context_window`, `failed` | on the main model's row only                                                                           |
| `at`                                                                                  | when the result was written                                                                            |

Indexes on `(ticket_id)`, `(run_id)`, `(investigation_id)`. Rows are written once and never updated, like
`agent_log`; like it, they stay when a ticket is removed.

A row per model, not a JSON blob per run: totals per ticket, step, model or day stay plain SQL `sum()`, and a later
project-wide view needs no parsing. A ticket's rows without `run_id` are its side runs (agent review, grouping, PR
description rewrite); they are not told apart.

### Recording: from `agent_log`, in `appendAgentLine`

Every agent call's events already reach `agent_log` with their owner, so `runAgent` does not change (its unread and
wrong `costUsd` goes away). When `appendAgentLine` writes a `result` event, it records that call
(`agent-usage-record.ts`, same transaction):

- the delta per model = the result's cumulative `modelUsage` − the previous `result` of the same session and owner
  (none: the delta is the cumulative itself);
- a negative delta (the CLI reset its totals) falls back to the result's `usage` for the main model, and to the
  cumulative for the others;
- the peak context = the largest `input + cache_read + cache_write` of the session's main-thread `assistant` lines
  (no `parent_tool_use_id`) between the two results, each `message.id` once; their `message.model` is the main
  model.

The parsing and the delta are pure (`packages/core/src/agent-usage.ts`, tested on a scrubbed real payload). The same
function records a past result, so the backfill replays `agent_log` with it: `recordUsage` is idempotent
(`result_line_id`, `model` unique).

Left out: `investigation-ticket.ts` (the ticket an agent writes from an investigation) logs nothing, so its call is
not counted.

### Reading

- `packages/core/src/agent-usage-totals.ts`: totals of a run, a ticket (per run, and per source for side runs), an
  investigation. Input shown = `input + cache_read + cache_write`, with the cached share.
- Web: `GET /api/tickets/:id/usage` and `GET /api/investigations/:id/usage` (read only, new route file
  `apps/web/src/routes/usage.ts`).
- The ticket's SSE already streams `agent_log` lines; the client refetches the usage on `run_finished`.

## UI

1. **Log** (built): the result line also gives the call's main-model tokens, from the result's own `usage`:
   `finished in 40s · 6 turns · 286k in (82% cached) · 4.0k out (1.3k thinking)`, and each run's header (shown
   folded too) their sum, with `2 calls ·` in front when the run made several. No cost in the Log: the result's
   cost adds up over the session; the Overview table shows each call's share from `agent_usage`.
2. **Overview tab** (built): the run table gets In, Out and Cost (API) columns; a row opens to its calls (turns,
   time, peak context) and their models (the main one, then the subagents'). Below the runs, one row for the side
   runs (agent review, grouping, PR description), then the ticket's total.
3. **Investigation detail** (built): a Usage tab beside Answer and Log, one row per call (the first answer, then
   each follow-up).
4. **Peak context warning** (built): in the opened row, amber when the peak passed 80% of `context_window`.

Cost is labelled "API-equivalent (not billed on Max)", smaller than the tokens.

## Steps

1. **Core**: `agent-usage.ts` (parse a result, the delta, the peak context; tests from a real payload), the
   `agent_usage` table and its migration (`bunx drizzle-kit generate`), recording in `appendAgentLine`. Drop
   `runs.cost_micro_usd` in the same migration.
2. **Worker**: remove `costUsd` from `AgentOutcome` and the tests.
3. **Backfill** (`scripts/usage-backfill.ts`, `bun run usage:backfill [db path]`): records every `result` already
   in `agent_log`, in order, with the same function. Idempotent.
4. **Log**: the result line gives the call's main-model tokens (`agent-events.ts`, `token-counts.ts`), and each
   run's header their sum (`log-tab.tsx`).
5. **Overview and investigations**: the totals module, the two routes, the Usage section (peak context there).
6. Docs: `docs/architecture/worker.md` and `core.md`, `SPEC.md` (the runs' data), this plan's status.

## Testing

- Unit: parse and delta (first call, resumed session, negative delta, two models, error result), peak context
  with repeated `message.id` and subagent lines, recording through `appendAgentLine`, Log line text, totals.
- Backfill on a copy of `union.sqlite` (`db:backup`), never the live file, and compare a few runs with their result
  events; then on the live file (ask first).
- Real: the next ticket step the user runs records its rows; compare them with its result event.

## Live instance

The migration and core edits reload the worker and restart its runs: `bun run active` first, then
`docker compose restart web worker`.

## Decisions (2026-10-17)

1. A table per call and model, rather than columns on `runs`: also covers investigations and side runs.
2. Drop `runs.cost_micro_usd` (never written) rather than fill it.
3. Show the API-equivalent cost, small and labelled, with the tokens first: it weighs Opus against Haiku and cached
   against fresh input.
4. Backfill the past runs from `agent_log`: on a copy first, then live once the user agrees.
5. Later, not in this plan: a project-wide view (per day, step, model), and a usage budget per ticket that pauses
   it.
