# Plan: a size budget for each change

Status: built (2026-11-06, branch `change-budget`), steps 1 to 5, with the decisions below as proposed. Checked with
unit tests and once against real Docker (ticket 9001: a trim pass kept, and one undone after red checks). Not done:
the size on the review page's header (only the ticket's Overview shows it; the final review reads it from the
implementation report), and a run on a real ticket.

## Problem

Agents write more code than the task needs: options nobody asked for, abstractions with one caller, defensive code
for cases that cannot happen, helpers that copy existing ones. The implement prompt already says "Stay in scope", and
the final review puts "structure" under Optional, so nothing pushes back on size. A reviewer sees the excess only
when reading the diff, after every step has run.

What the live database holds (latest diff snapshot of each of 35 tickets, 2026-11-06), counting only the lines added
outside tests, lock files, migrations, generated maps and Markdown:

| Lines of code added | Tickets | Examples                                       |
| ------------------- | ------- | ---------------------------------------------- |
| under 50            | 16      | 17 (1), 25 (20), 31 (47)                       |
| 50 to 500           | 5       | 7 (118), 24 (129), 3 (238), 41 (392)           |
| 500 to 1,000        | 6       | 5 (531), 10 (571), 36 (720), 9 (848)           |
| over 1,000          | 8       | 32 (1,042), 43 (1,350), 14 (1,848), 18 (2,137) |

Median 129, 75th percentile 655, 90th 1,244. Tests often add one to three times the code (ticket 18: 2,852 lines of
tests for 2,137 of code; ticket 33: 3,342 lines of tests and 300 files for 21 of code). A count of the raw diff would
mostly measure tests and generated files, so the budget counts code only.

## Idea

A ticket gets a size budget when its plan is approved. The host measures the change after the implementation. Over
the budget, the implementer is sent back once to cut what the task does not need, then states why the remainder is
needed. The user sees the estimate, the measure and the reason in the ticket and at the review. Nothing is blocked:
the user decides.

The agent never measures itself, and the budget is never a number the agent sets alone: the technical step proposes
it and the user approves it with the plan.

## Steps

### 1. Measure and show (no budget yet)

- Core `change-size.ts` (pure): from a list of `{ path, additions, deletions }`, the lines of code added and
  removed, and the counts left out by kind (tests, generated, docs). What is left out: the project's
  `sizeIgnore` patterns (gitignore-style, like `reviewIgnore`), else a default list: lock files (the list
  `hideLockFiles` already uses), `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `**/test/**`, `**/tests/**`,
  `**/e2e/**`, `**/migrations/**`, `**/*.snap`, `**/*.md`, and binary files. Deletions never count against the
  budget: removing code is welcome.
- It reads the diff snapshot that `implement.ts` already captures (`diff_files.additions`/`deletions`), so no new
  git call and no migration.
- The ticket's Overview and the review page's header show "312 lines of code (+840 tests, +12 other)", with the
  files counted listed on hover.
- `ProjectConfig.sizeIgnore?: string[]`, edited in Project settings → Agents → Checks, beside the gate command.

Shipping this alone shows how often changes are larger than expected before anything acts on it.

### 2. The estimate in the plan

- The `technical` prompt ends its section with one line: `Estimated size: <n> lines of code` (tests, generated
  files and docs excluded, as step 1 counts), the number derived from the files it lists.
- Core `size-estimate.ts` parses it from the approved `technical` output (last match wins; absent or unreadable:
  no estimate). Editing the number in the step's output before approving it sets the budget, as any edit of an
  output does today; nothing new in the web.
- A flow without the technical step (Quick, custom flows) uses `ProjectConfig.sizeBudget?: number` (Project
  settings, same section); absent: no budget, step 1's measure only.
- Overview and review show "312 of ~150 estimated".

### 3. The trim pass

After the implementation's checks are green and before the push (`implement.ts`, between `implement()` and
`publish()`), in a new `apps/worker/src/implement/size-trim.ts`:

- Measure with the same rule on `git diff --numstat <base>...HEAD` in the container (the snapshot is taken after
  this). Within `budget × SIZE_TOLERANCE` (1.5, since estimates are rough): nothing happens.
- Over it: the implementer's own session is resumed (as `rebase` and `simplify` are) with a new `trim` prompt, an
  agent id like `rebase` (prompt only, Implementation model, editable in Union settings):

  > Your change adds 480 lines of code against an estimate of 150. Remove what the task does not need: options
  > and parameters nobody asked for, abstractions with a single use, handling of cases that cannot happen, code
  > that repeats a helper the repository already has, comments that restate the code. Do not remove tests the
  > test plan lists, and do not change behaviour the acceptance criteria require. Commit, then output a
  > "## Size" section: what you removed, and for what remains over the estimate, why the task needs it.

- The checks run again through the implement loop (red checks get the usual retries). Then the host measures
  again.
- Once per implementation, never on a revision's own size: a revision measures and shows, and the trim runs only
  on the ticket's first implementation (decision to confirm, below).
- `implement` events: `union_size_measured` `{ counted, removed, excluded, budget, phase: 'before_trim' |
  'after_trim' | 'final' }`, declared in `event-payloads.ts`. The implementation report gets the agent's
  `## Size` section and the two measures.

### 4. The final review weighs it

- `final_review`'s prompt gets the measure, the estimate and the implementer's `## Size` section.
- Its default prompt adds "code the task does not need (unused options, single-use abstractions, speculative
  cases, duplicated helpers)" to the reasons to request changes, moving it out of Optional. A feedback round on
  that runs like any other.

### 5. Usage

- `usage-findings.ts` gets one finding: tickets whose change ran over `SIZE_TOLERANCE` times their estimate, and
  the average ratio of measure to estimate per project. A ratio far above 1 points at the technical prompt (it
  under-estimates) or the implementer (it over-writes); the trim pass's before/after events tell which.
- The "Suggest improvements" run (`usage-suggestion-prompt.ts`) gets those figures.

## Files

| Part   | Files                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core   | `change-size.ts` (+test), `size-estimate.ts` (+test), `agents.ts` (`trim`, technical and final review prompts), `schema-types.ts` (`sizeIgnore`, `sizeBudget`), `event-payloads.ts`, `usage-findings.ts` |
| worker | `size-trim.ts` (+test with the fake runtime), `implement.ts` (the call), `review.ts` (the size in the prompt)                                                                                            |
| web    | the Overview and review header line, the two settings in the Checks section                                                                                                                              |
| docs   | `docs/spec/flow.md` (the step), `docs/architecture/agents.md` (the trim prompt), `documentation/ticket-lifecycle.md`, `documentation/reviewing.md`, `documentation/settings.md`                          |

No migration: the measure comes from the diff snapshot and events, the settings live in the project's JSON config.

## Decisions to confirm

1. **Code only.** Tests, generated files and docs are left out of the count; deletions never count. Alternative:
   count everything with a higher budget, rejected because tests dominate the raw diff (table above).
2. **Estimate from the technical step, edited by the user**, with a project default for flows without it. A single
   project-wide number was the first idea; it does not fit both a label change and a new integration.
3. **Tolerance 1.5×** before the trim pass, a named constant, not a setting at first.
4. **Trim once, on the first implementation only.** Revisions are measured and shown, not trimmed: a revision
   answers feedback, and cutting it could undo what the user asked for.
5. **Never blocking.** Over budget after the trim, the ticket goes on to the final review with the reason shown.
   Alternative: stop at a gate for the user's approval, rejected for now as one more stop on every large ticket;
   an event rule can notify on `union_size_measured` if wanted.
6. **The final review requests changes for unneeded code**, which today is Optional. This changes a default
   prompt, so users who edited theirs keep their own.

## Risks

- The estimate is a guess; an agent may pad it to avoid the trim. The user approves it, and step 5 shows whether
  estimates drift up over time.
- A trim pass can break behaviour while cutting: the checks run again, and the final review reads the result.
- It adds an agent turn on large tickets (cost). Limited to one per ticket, on a session already in cache.
- Repositories with unusual layouts (tests beside code without a `.test.` suffix) count tests as code until
  `sizeIgnore` is set.
