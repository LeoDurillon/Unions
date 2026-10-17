# Plan: spend fewer tokens per ticket

Status: planned (2026-10-17), not started.

## Problem

What the agents used up to 2026-10-17 (`agent_usage`, 190 calls, $161 API-equivalent; on Max it tracks how fast the
usage limit is reached):

| Step         | Cost | Share | Why                                                            |
| ------------ | ---- | ----- | -------------------------------------------------------------- |
| implement    | $82  | 51%   | 177M cache-read tokens; peak context 194k on average, 515k max |
| final_review | $41  | 25%   | 45 reviews for 10 tickets; tickets 3, 6, 9, 10 had 7 to 9 each |
| rebase       | $15  | 9%    | 15 calls in a session of 242k on average                       |
| simplify     | $4   | 3%    | 3 calls in a session of 379k on average                        |
| planning     | $11  | 7%    | already on Haiku and Sonnet: left as is                        |

Output and thinking are a small part. The cost is the context times the turns: every turn reads the whole session
again from the cache. So the levers are fewer review rounds, smaller sessions, and not carrying a large session into
a job that does not need it.

## Step 1: re-reviews that know the previous round

Today `runReviewStep` (`apps/worker/src/review.ts`) starts a fresh session with the plan and the full diff, and
nothing of the earlier reviews or of what the implementer was asked. Each round reads everything again and can raise
new findings, which sends the implementer back once more.

- When the ticket has an earlier `final_review` output, add to the prompt: that review, the feedback sent to the
  implementer after it, and the commits since (`git diff <reviewed commit>..HEAD`).
- Record the commit a review read. Check first whether the diff snapshot (`schema-diff-commits.ts` and its snapshot)
  already has the head; else store it with the review's output (a migration).
- Tell a re-review to say which earlier findings are fixed, and to request changes only for findings still open or
  problems in the new commits.
- Change the default prompt's bar: `CHANGES_REQUESTED` only for bugs, missing acceptance criteria or missing planned
  tests; quality remarks go under "Optional", which does not change the verdict.
- Tests: the prompt with and without an earlier review (`buildPrompt` level).

Decision to make: run re-reviews on Sonnet and keep Opus for the first one (a `final_review` setting, or a separate
model for re-reviews on the agent's page)?

## Step 2: a size limit on the implementer's session

The implementer's session is resumed for every revision and every failed check (`implement-loop.ts`), and never
reset: by the later revisions it holds 250k to 500k (run 156: 35 turns at about 500k, 19M cache reads, $5.83).

- Before resuming, read the session's last `peak_context` from `agent_usage`. Above a limit (150k to start with, a
  named constant; maybe a project setting later), start a fresh session instead.
- The fresh session gets the task as a first run does (approved plan, shared and project prompts), plus where the
  work stands: `git log <base>..HEAD`, `git diff --stat <base>...HEAD`, the last implementation report, then the
  feedback or the failed checks.
- Log it (`union_session_reset`, declared in `event-payloads.ts`) so the Log says why the session changed.
- Check whether the CLI's own auto-compaction can be made to start earlier from the environment; if so, compare it
  with a fresh session on one real ticket before choosing.

## Step 3: rebase and simplify in a fresh session

Both resume the implementer's session (`runInImplementerSession`, `rebase-agent.ts`) for jobs that need none of its
history: a simplification must leave the files exactly as they are, and a rebase needs the conflicts and the plan.

- Always use the `fresh` prompt there (it exists already, for a lost session), not the resumed one.
- `implementerSession` picks the last `rebase` or `simplify` run as the session to resume next: after this step that
  is a small fresh session. Decide: keep it (smaller next revision, but without the implementation history), or skip
  rebase and simplify runs there so the next revision resumes the implementer's own.
- Maybe a model of their own (Sonnet) instead of the implementer's: `modelFor` and `effortFor` keep them on
  `implement` today.

## Step 4: the PR description in a fresh session

The user's setting runs `pr_description` on Haiku, resuming the implementer's Opus session (`pr-description.ts`,
`pr-description-run.ts`). The cache does not carry across models, so each call writes the whole session again
(up to 194k seen), and it fails once the session is larger than Haiku's window.

- Run it fresh: the ticket, the approved summary, the implementation report and the instruction to read the diff (the
  rewrite prompt already does). Keep the resumed session only when its model is the implementer's.

## Step 5: small ones

- `gateHint` asks the implementer to run the whole check command, which the host runs again right after. Ask it to
  run the tests and lint of what it touched, and leave the full run to the host.
- Thinking effort: leave the defaults; thinking is a small part of the cost.

## How to check

After each step, compare on the next tickets in `agent_usage`: review runs per ticket, cache reads per implement
call, peak context of rebase and simplify calls. Steps 1 to 3 are expected to save 40 to 60% of the total (an
estimate from the figures above, not measured).
