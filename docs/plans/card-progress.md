# Plan: live progress on board cards

Status: built (2026-11-04, commit `8c6b833`). Checked on a copy of the live database with one run marked running
(the clock ticks, three polls in about seven seconds, only that card shows the line, no write tried). Seen
during a real agent run since.

## Idea

A running card said only "Running · Implementation": whether the agent was working or stuck took opening the
ticket's Log.

## Built

While its step runs, a card shows how long the run has gone (ticking each second) and, under it, the agent's last
message: the tool it called (monospace, `Edit src/api/client.ts`) or the first line of what it wrote, whole on
hover. After two minutes without a message the clock line adds "last message 5 min ago" in amber.

- Server: `GET /api/projects/:projectId/run-progress` (`routes/run-progress.ts`, core `run-progress.ts`): each
  running run's start, and its newest assistant line of `agent_log` that says something (thinking skipped).
  6.5 ms on the live ticket with the most log lines (about 5,000).
- The summary of a message is `@union/core/agent-activity`, shared with the Log (`lib/agent-events.ts`), so both
  say the same.
- Client: `card-progress.tsx` in `ticket-card.tsx`; every running card reads one query
  (`lib/use-run-progress.ts`), polled every 3 s while the tab is visible, keyed under `tickets` so a run starting or
  ending refreshes it at once.

## Decisions (2026-11-04)

- Polling, not the event stream: agent output stays off the shared stream on purpose (`routes/events.ts`).
- The activity sits on its own line: beside the clock, the 13 rem card left it a few characters.
- The quiet warning starts at two minutes: long tool calls (builds, tests) stay under it most of the time.
