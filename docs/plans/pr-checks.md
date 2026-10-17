# Plan: the pull request's CI checks, and sending failures to the implementer

Status: in progress (2026-10-17). Steps 1 and 2 built (core: `ci-output-text.ts`, `ci-outputs.ts`, `agent-inputs.ts`,
table `ci_outputs`, migration 0049). Step 0 done: the GitHub App now has the permissions (below), and the reads work on
SenovaFR/Senova. Decisions taken: the log is fetched when the user keeps or sends; failed checks only; one revision
per send.

## Want

The ticket's Pull request tab lists the CI checks of the PR's head commit (GitHub Actions and other CI), with their
state. When some fail, the user picks them and gives them to the implementer, as with a command's output
([container commands](container-commands.md)): kept for its next run, or sent now as a revision with a note.

## What GitHub gives (checked in the REST docs, 2026-10-16)

- **Check runs** (GitHub Actions and any CI built as a GitHub App): `GET /repos/{o}/{r}/commits/{sha}/check-runs`
  (paginated, 100 per page; only the 1000 newest check suites of a ref). Each run has `name`, `status`,
  `conclusion` (`failure`, `timed_out`, `cancelled`, `action_required`, …), `details_url`, `output.title`,
  `output.summary`, `output.text`, `app.slug`.
- **Annotations**: `GET /repos/{o}/{r}/check-runs/{id}/annotations`: `path`, `start_line`, `annotation_level`,
  `message`. Linters and test reporters write them; Actions writes `##[error]` lines and failing exit codes as
  annotations too.
- **Commit statuses** (older CI that posts statuses, Vercel and others): `GET /repos/{o}/{r}/commits/{sha}/status`:
  `context`, `state`, `description`, `target_url`. No log through GitHub, only the description and the link.
- **GitHub Actions logs**: a check run created by Actions has the job's id as its id. `GET /repos/{o}/{r}/actions/jobs/
  {id}` gives `steps[]` with `name` and `conclusion` (find the failed step); `GET …/actions/jobs/{id}/logs` answers
  302 to a download URL that expires after 1 minute (plain text, a timestamp per line, `##[group]` / `##[error]`
  markers). Logs are kept as long as the repository's retention (90 days by default).
- **In one query**: GraphQL `pullRequest.commits(last: 1) { nodes { commit { statusCheckRollup { state contexts } } } }`
  gives the overall state and both kinds (`CheckRun`, `StatusContext`): enough for a badge, cheaper than REST.
- **Permissions**: classic tokens need `repo` for private repositories. The GitHub App needs read on **Checks**
  (check runs, annotations, the GraphQL rollup), **Commit statuses** and **Actions** (jobs, logs); an installation
  must accept new permissions before they apply. Without Checks and Commit statuses, all three answer 403 "Resource
  not accessible by integration"; Actions alone still lists workflow runs, jobs and logs. Not checked: what a
  fine-grained token needs (the project uses the App). A missing permission is shown in the tab as such, naming it.

So: possible. Full logs only for GitHub Actions; other CI gives its summary, annotations and a link.

## Design

- **Read in the web server** (the UI needs it right away, read only): `OnboardingGitHub` gains `pullRequestChecks`
  (rollup and runs of the head commit) and `checkFailure` (one run's text for the agent). New file
  `src/github-checks.ts` for the GitHub shapes, so `github-onboarding.ts` grows by a few lines only.
- **What the agent gets for one failed check** (built in core, pure, `ci-output-text.ts`, tested): the check's
  name, conclusion and link; its `output.title` / `summary` / `text`; its annotations (`path:line message`, failures
  and warnings, capped); for Actions, the failed step's name and the tail of the job log cut to that step
  (`##[group]` boundaries), timestamps and colours stripped, within the limits `outputTail` already uses.
- **Stored like a command output**: a table `ci_outputs` (ticket, head sha, check name, url, text, kept,
  sent_at). The user sees exactly the text the agent will get before sending. `pendingForAgent` /
  `markSentToAgent` learn the second source, and `implement-prompts.ts` adds a `# Failed CI checks` section (data,
  not instructions, like the command output section). One generalized "given to the agent" query rather than two
  copies.
- **Routes** (`/api/tickets/:id/pr-checks`): `GET` the checks; `POST /:checkId/keep` (fetches the text, stores the
  row kept); `POST /send` with `{ checkIds, note }` (fetches, stores, then `revise` with the note, refused when
  `revisesImplementer(phase)` is false or a command is pending, as in `container-runs.ts`). Default note: "The CI
  checks below failed on the pull request; fix what they show."
- **Related output**: a failed check lists the other jobs of its workflow run (`check_suite` of the run, or
  `GET …/actions/runs/{run}/jobs`) and the PR's comments from bots; each can be added to what the agent gets, as
  its own block with its source named.
- **Stale checks**: checks belong to the PR's head sha. When it is not the branch's last pushed commit (the agent
  pushed since), the list says "for commit abc123, before the last push" and sending is still allowed but labelled.
  Pending checks show as running; the tab refetches every 30 s while any is pending, and has a Refresh button.
- **UI**: `pull-request/checks.tsx` (list: state icon, name, duration, link, a checkbox on failed ones),
  `pull-request/check-failure.tsx` (the text the agent gets, expandable), the send box reusing
  `run-agent-actions.tsx`. Placed after `BranchStatus` in `pull-request-tab.tsx`. Merged PRs: hidden.

## Step 0: checked on SenovaFR/Senova (2026-10-16, read only, the App)

- 25 check runs per PR head, all `github-actions`; `output.title`, `summary` and `text` empty on every one: for
  Actions, the useful text is the job log and the annotations. One commit status (CodeRabbit). The rollup gives
  `FAILURE` with 26 contexts in one GraphQL call.
- The failing check, "Fail on findings", has 2 annotations ("Process completed with exit code 1." and a runner
  notice) and a 41-line log whose failed step only says "Knip found unused code. See the PR comment for details."
  The findings are elsewhere: in the log of "Knip unused code report" (440 lines, passed, same workflow run) and in
  the `github-actions[bot]` comment "Evaluation Tool Report" on the PR. No artifacts.
- So the failed job's own text is often not enough. The design adds **related output**: next to a failed check,
  the other jobs of the same workflow run (their logs, the user picks) and the PR's bot comments posted for that
  head (pickable, through the existing comment import). Annotations at `notice` level and runner lines are dropped.

## Steps

1. Core: `ci-output-text.ts` (log cut to the failed step, annotations, caps) with tests on real log samples;
   schema `ci_outputs` and migration; the generalized pending query.
2. Web: GitHub reads (`github-checks.ts`, fake for tests), the routes, a test of keep / send / refusals.
3. Worker: the prompt section in `implement-prompts.ts`, marked as sent after the first turn (same place as the
   command outputs), with a test.
4. UI: the checks list, the failure text, keep / send. UI check with `scripts/ui-check/`.
5. Docs: `SPEC.md` (Pull request tab), `docs/architecture/integrations.md` (the new permissions), the App setup
   text, maps.

## Later

- **A badge on the ticket card** (green, red, running): the worker reads the rollup in the same poll as `pr_state`
  (`github/pull-request.ts`), stored on the ticket, and an event `pull_request_checks_changed`.
- **Event rules and notifications**: "checks failed" as a trigger, and an inbox notification.
- **Fix on its own**: send failed checks to the implementer without asking, with a limit per ticket. Uses Claude
  usage unprompted: off by default, per project.
- **Re-run a failed job** (`POST …/actions/jobs/{id}/rerun`): a GitHub write, so a worker command.

## Decisions (2026-10-16)

- The log is fetched when the user keeps or sends a check (the download URL expires after a minute anyway).
- Failed checks only; warnings of passing checks are not offered.
- One revision per send, with every selected check and related output.

## Step 1 as built

- `ci-output-text.ts` (pure): `failedCheckText` (heading and link, the check's output, annotations without notices
  nor the runner's "exit code" line, the failed step's log), `relatedJobText` (every step), `botCommentText`. A log
  loses its timestamps, colours, the runner's setup and cleanup, each group's body (the script, shell and
  environment a step echoes: on the real Knip job, half the log) and markers other than error and warning; it
  keeps its last 300 lines, 32 KB per block.
- On the real PR #1615: the failed check gives 6 useful lines; the Knip report job gives its install output, not
  the findings (the step writes them to a file and to the step summary, which the API does not serve). The bot
  comment is the only source of the findings there.
- `ci_outputs`: one row per block (`check`, `job`, `comment`), kept for the next run (`next_run`), read (`sent`) or
  taken back (null); keeping the same check on the same commit again replaces its text.
- `agent-inputs.ts`: `pendingAgentInputs` / `markAgentInputsSent` read and mark command and CI outputs together;
  the worker switches to them in step 3.

## Step 2 as built

- `CiGitHub` (`apps/web/src/github-checks.ts`, Octokit `OctokitCi`): `listChecks` (the head's check runs, its commit
  statuses, the PR's bot comments: newest edit first, 20 at most), `readCheckRun` (output and annotations),
  `readJobLog` (null past retention), `readComment`. Parsing in `github-check-parse.ts`: cancelled, skipped, neutral
  and stale runs are `skipped`, not failed. `createApp` takes it as a fourth argument; the routes get
  `ApiServices` (`services.ts`).
- `/api/tickets/:id/pr-checks` (`routes/pr-checks.ts`): `GET` the checks, what was given, `canSend`; `POST /preview`,
  `/keep`, `/send` with `{ picks: [{ kind: 'check' | 'job' | 'comment', id }], note? }` (1 to 10 picks, each checked
  against the current listing: a check must have failed, a job must be an Actions job of the head, a comment one of
  the bot comments); `POST /given/:outputId/drop`. GitHub's 403 is answered naming the permissions.
- Checked on the live instance (read only): ticket 10 (PR #1615) lists 26 checks (1 failed, 2 skipped) and 4 bot
  comments; a preview of the failed check and the "Evaluation Tool Report" comment gives the four unused exports
  with their paths. Nothing stored.
