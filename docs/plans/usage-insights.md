# Plan: what the agents' logs say to improve

Status: part 1 built (branch `usage-insights`, 2026-11-05), checked on a copy of the live database; parts 2 and 3
planned.

## Idea

The Usage tab says how much each step and ticket cost, not why. A first look at the Senova logs by hand
(2026-11-05, 32 tickets, $860 API-equivalent) found causes that the logs show directly:

| Seen                                               | Figure                                              | Points at                    |
| -------------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| Large sessions: implement, rebase, simplify, split | peak context 313k, 349k, 441k, 877k on average      | Union (token savings plan)   |
| One ticket costing a third of the total            | ticket 18: $280, 41 implement calls, 23 reviews     | the ticket, the review loop  |
| A large output read again and again                | `git diff base...HEAD -- <file>`: 333 calls, 3.1 MB | the review prompt            |
| No single way to run the checks                    | about 30 forms of jest, tsc, eslint and turbo       | the repository (a script)    |
| The same files read across tickets                 | `spaces.ts` 22 reads over 6 tickets                 | the repository (module docs) |
| Commands refused                                   | 187 refusals: `&&`, `$()`, `cd`, `gh`               | the repository's CLAUDE.md   |
| A skill loaded for every commit                    | `gitmoji-commit` 29 times                           | the repository's CLAUDE.md   |

Union can compute these itself, for every project, and then ask Claude what to change.

The recording below corrected one reading by hand: the large diffs are mostly read one file at a time, as the
review prompt asks (333 calls, 3.1 MB); the whole diff at once is 86 calls and 0.7 MB.

## Part 1: findings from the data, no Claude

### Recording: `agent_tool_usage`

Reading `agent_log` (200 MB on the live database) on each request is too slow, so tool calls are counted when a
call ends, like `agent_usage`:

- One row per agent call (its `result` line) and tool key: `tool`, `target`, `variant`, `subagent`, with `calls`,
  `errors`, `denied`, `result_bytes`. Owner columns copied from the result line, as in `agent_usage`.
- The key (`agent-tool-key.ts`, pure): for `Bash`, the command's family (`git diff`, `git diff --stat`, `jest`,
  `tsc`, `eslint`, `turbo`…) as `target` and its form (the family and the flags, without values) as `variant`; for `Read`, the
  file (relative to the repository); for `Skill` the skill, for `Agent`/`Task` the subagent type; else empty.
- The call's lines are those of the same owner and session since the previous `result`, as for the peak context:
  `assistant` lines give the tool uses, `user` lines their results (size, `is_error`), `system`
  `permission_denied` lines the refusals. A subagent's lines (`parent_tool_use_id`) count with `subagent` set: their
  output does not enter the main session.
- Written in `appendAgentLine`'s transaction (`recordToolUsage`). `bun run usage:backfill` also fills it for past
  calls.

### Findings: `usage-findings.ts` (core, pure)

Over a range of days, from `agent_usage` and `agent_tool_usage`. Each finding: a kind, a sentence with its figure,
who should act (`repository` or `union`), and the tickets that show it most (links). Thresholds are named
constants.

- `large_sessions`: steps whose calls average a peak context over 150k.
- `costly_tickets`: tickets above three times the median ticket cost (from five tickets), with their implement
  calls.
- `review_rounds`: tickets with more than three final reviews.
- `large_outputs`: commands whose results in the calls' own sessions add up to over 200k characters and average
  over 5k per call (reading code piece by piece with `cat` or `grep` is not one).
- `check_variants`: check families (jest, vitest, tsc, eslint, turbo, playwright, `test`, `lint`…, not git
  commands) run in more than five forms.
- `repeated_reads`: files read in at least three tickets (not Union's own `.git/union-*` files).
- `denied`: refusals, by tool, when more than ten.
- `repeated_skills`: a skill loaded more than ten times.

### Showing them

`GET /api/projects/:projectId/usage/findings?days=` and a "What to improve" section on the Usage tab, after the
weekly chart: one card per finding, what to do, who acts (Repository or Union), each item's figure and the
tickets that show it most as links. The words live in the client (`lib/finding-text.ts`); core returns figures.
The guide (`documentation/how-it-works.md`, Usage and cost) says what each means.

### Checked

- On a copy of the live database: the backfill recorded the tool uses of 594 past calls in 6 s; the findings for
  Senova over all time take about 50 ms.
- To deploy: the migration adds the table, then `bun run usage:backfill` once fills it for past calls.

## Part 2: "Suggest improvements" (uses Claude)

A `usage` investigation scope beside `global`, `repository` and `ticket`: the repository checked out read-only, the
findings as a compact digest (not the raw logs), and the question: concrete changes, each tagged repository change
(CLAUDE.md line, module AGENTS.md, check script, skill, subagent: drafted as a ticket with the existing
investigation tickets), lesson for a step (proposed to Memory), or Union setting. Started from a button on the
Findings section, with the cost said before.

## Part 3: did it help

Remember when a suggestion was applied, and compare the same figures before and after it.

## Decisions (2026-11-05)

- Thresholds are constants first, not settings.
- Findings that point at Union show too, labelled so.
- Part 1 before part 2: it uses no Claude usage and is useful on its own.
