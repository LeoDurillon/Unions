# Plan: Claude usage meter and a project's Usage tab

Status: built (2026-11-04, commit `f098804`). Checked on a copy of the live database (project 1: $915.33 over 640
calls, the two projects adding up to the $918.42 recorded; both queries under 8 ms; tooltip, range switch and
ticket links in headless Chromium, no write tried). Left: dark mode looked at; the meter seen moving during a run.

## Idea

A usage limit showed only once a run had stopped on it, and the tokens of each run had no total per project.

## What Claude reports

Every `claude -p` call prints `rate_limit_event` lines (about 1,700 in the live `agent_log` when this was built):
`rate_limit_info.status` (`allowed`, `allowed_warning`, `rejected`) and `unifiedWindows.five_hour` /
`seven_day`, each with `utilization` (0 to 1) and `resetsAt` (seconds). These are the subscription's own figures,
not an estimate.

## Built

- **Meter** at the bottom of the sidebar (`usage/claude-meter.tsx`): 5 hours and Week, each a bar, its share and
  when it starts over; amber from 80%, red at the limit, the share and "limit" always in words. A window past its
  reset says "reset" rather than an old share. Older than ten minutes, it says how old. Folded: the higher share.
  Server: `GET /api/claude-limits` (`routes/claude-usage.ts`, core `claude-limits.ts`), the newest report within
  the last 20,000 agent lines; polled every minute.
- **Usage tab** beside Pull requests (`usage/usage-page.tsx`): 7, 30 or 90 days or All; API-equivalent cost
  ("Not billed on Max"), calls, tokens in and out; cost per week as bars (`usage/weeks-chart.tsx`, scale in
  `lib/nice-scale.ts`, figures on hover or focus); tables per step, per model and the ten most expensive tickets
  (a click opens one), investigations on their own line (`usage/usage-breakdown.tsx`). Server:
  `GET /api/projects/:projectId/usage?days=7|30|90|all`, core `project-usage.ts` (the query) and
  `usage-summary.ts` (pure sums, weeks starting Monday UTC).

## Decisions (2026-11-04)

- Union learns the windows only from its own agents: usage in Claude Code or claude.ai shows at the next agent
  call. Said in the meter's hover text and the guide.
- No migration: the latest report is read from `agent_log`, bounded, rather than kept in a table of its own.
- A project's total is its `agent_usage` rows, and those exist only for calls tied to a ticket or an
  investigation. Calls logged with neither (an explanation, a grouping, a review agent or a report on a pull
  request reviewed outside a ticket) have no usage row and no project: 5 such results in the live `agent_log`
  when this was built. Counting them needs a project on those log lines first.

## Ideas

- A per-ticket budget or a warning when a ticket's cost passes a threshold.
- The meter's history (the share over the last days), from the same `rate_limit_event` lines.
