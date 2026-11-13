# Agents

Every Claude Code run Union starts, in one place: where it runs, what it is given, what it must answer and who
reads the answer. The user's side of it (settings pages, custom agents, memory) is `documentation/agents.md`;
custom agents' design is `docs/spec/custom-agents.md`.

## Settings

An agent's prompt, model, effort and tools are resolved on every run (`packages/core/src/agent/agents.ts`):

- Defaults: prompts in `DEFAULT_PROMPTS` (`agent/default-prompts.ts`; a few come from `pr-prompts.ts` and `lesson-writer.ts`), models in
  `MODEL_BY_AGENT` (`MODEL_BY_STEP` in `states.ts` for the steps), tools in `DEFAULT_TOOLS` (`agent-tools.ts`).
  Change a default there, never in the worker.
- Overrides: one `agent_configs` row per edited agent; Reset deletes it. `resolveAgent` merges the two.
- A run asks `modelFor`, `effortFor` and `toolsFor` with its step. The steps in `IMPLEMENTER_SESSION` (`rebase`,
  `retarget`, `simplify`, `split`, `restack`) read the `implement` agent's model and effort, and get its tools plus
  the git commands in their own `DEFAULT_TOOLS` entry. `retarget` and `restack` have no prompt of their own: they
  run the `rebase` prompt.
- `pr_description` and `pr_replies` resume the implementer's session but have their own settings, which start on
  the Implementation _default_ model: changing Implementation's model does not move them.
- The tools an agent picks from: Claude Code's own, the rules the defaults use, the user's additions
  (`agent_tools`) and the account's claude.ai connectors (`mcp-connectors.ts`). A run loads the connectors only
  when its tools include one (`connectorEnv` in the worker's `agent.ts`); `ConnectorChecker` (`mcp-check.ts`)
  reads them on request.
- The effort becomes `claude --effort`; null passes nothing, so Claude Code decides.
- Custom agents (`agent_<id>`) take their defaults from `custom-agent-config.ts` (the written prompt, Sonnet,
  `CUSTOM_AGENT_TOOLS`, or `REVIEW_AGENT_TOOLS` with bare `Bash` for a review agent); `Edit`, `Write` and
  `NotebookEdit` are refused for them, and bare `Bash` for a ticket step (`validateTools` reads the kind).

Denied rules always win over a selected tool and are not editable. They live in core (`agent-denied.ts`), so the
"Suggest improvements" prompt describes the rules the runs get. Every run gets `BASE_DENIED` (no push, no remote,
no `gh`, no `curl`; `agent.ts` adds it). Runs that work on the branch add `IMPLEMENT_DENIED` (no checkout, switch,
rebase, reset, merge, worktree, branch deletion), loosened per step by `deniedFor`: a rebase (and retarget,
restack) may rebase and merge, simplify and split may rebase and reset. The PR description and replies get
`IMPLEMENT_DENIED`. A ticket investigation denies every writing tool (`TICKET_INVESTIGATION_DENIED`).

## The prompt

A pipeline step's prompt is built by `buildPrompt` (`apps/worker/src/prompts.ts`), in this order:

1. **Shared**: the `shared` agent's prompt, then the project's instructions (`projectInstructions`), then the step's
   lessons unless `config.memory` is false. That is `stepSharedPrompt` (`lessons.ts`); runs outside the pipeline get
   `sharedPrompt`, the same without lessons; the spec report gets its own lessons (section `review_report`,
   `reportLessonsPrompt`) after it.
2. `# Task`: the ticket's title and body.
3. `# Builds on`: the parent ticket and where to see its changes, when it has one.
4. `# Attached files`, `# Project files`, when there are any. Attached Office files and zip archives get a hint on
   reading them with `unzip -l` / `unzip -p` when the step's tools allow those commands (`archive-hint.ts`).
5. `# Approved: <step>`: each earlier step's approved output, in the flow's order (`approved.ts`).
6. `# Your job`: the agent's prompt, followed by what the worker appends (see "What Union reads back").
7. The flow note (`flowNote`): what the flow skipped, for the implementer and the final review.
8. `# Revision`: the previous output and the user's feedback, on a revision.

The steps run in the implementer's session (`runInImplementerSession`, `rebase-agent.ts`) send only their
instructions when that session still exists, and a fresh `buildPrompt` with `sharedPrompt` when it is lost
(`runResumable`). The review side runs (comments, groupings, explanations) and the PR description and replies build
their own prompt from `sharedPrompt` and the agent's prompt, in the modules of the table below.

## Where each agent runs

| Agent                                                 | Container                           | Session                        | Lessons | Code                                           |
| ----------------------------------------------------- | ----------------------------------- | ------------------------------ | ------- | ---------------------------------------------- |
| `intake`, `summary`, `technical`, `test_plan`, custom | ticket's                            | fresh; a revision resumes it   | yes     | `planning-step.ts`, `custom-step.ts`           |
| `implement`                                           | ticket's                            | fresh; a revision resumes it   | yes     | `implement-loop.ts`                            |
| `final_review`                                        | ticket's, on the branch             | fresh, told its earlier review | yes     | `review.ts`                                    |
| `split_plan`                                          | ticket's                            | fresh; a revision resumes it   | yes     | `split-plan-step.ts`                           |
| `trim`                                                | ticket's, in the implementation run | implementer's                  | no      | `size-trim.ts`                                 |
| `rebase` (and retarget, restack)                      | ticket's                            | implementer's                  | no      | `rebase-agent.ts`                              |
| `simplify`                                            | ticket's                            | implementer's                  | no      | `simplify-agent.ts`, `simplify-stack-agent.ts` |
| `split`                                               | ticket's                            | implementer's                  | no      | `split-agent.ts`                               |
| `pr_description`                                      | ticket's                            | implementer's                  | no      | `pr-description.ts`, `pr-description-run.ts`   |
| `pr_replies`                                          | ticket's                            | implementer's                  | no      | `pr-reply-suggestions.ts`                      |
| `review_comments`                                     | ticket's, or `union-a<id>` for a PR | fresh                          | no      | `agent-review.ts`, `agent-review-stack.ts`     |
| `review_groups`                                       | ticket's, or `union-g<id>` for a PR | fresh                          | no      | `review-grouping.ts`                           |
| `review_explain`                                      | ticket's, or `union-e<id>` for a PR | a ticket's follow-up resumes   | no      | `review-explain.ts`                            |
| `review_report`                                       | ticket's, or `union-s<id>` for a PR | fresh                          | its own | `review-report.ts`                             |
| review agents (custom, of the review kind)            | `union-v<id>`, for a ticket too     | fresh                          | yes     | `review-agent-run.ts`                          |
| `lesson_writer`, `lesson_tidier`                      | throwaway, no repository            | fresh                          | no      | `lesson-writer-run.ts`                         |

Runs without an agent page: the prompt writer (Sonnet, throwaway, `prompt-writer-run.ts`), the connector check
(`mcp-check.ts`), investigations (`union-i<id>`, or the ticket's container; model and tools from the form, the project's instructions via `projectInstructions`,
`investigate.ts`) and the ticket drafts written from them (`investigation-ticket.ts`). Throwaway containers hold
only the Claude login (`throwaway-container.ts`).

## The image

Every container starts from the default agent image (`union-agent:local`, or Union settings → System's `agentImage`, the last stage of
`docker/agent.Dockerfile`: the `base` stage plus node/npm, Bun, corepack and Playwright's libraries), unless its
project has its own (Settings → Agents → Agent image,
`docs/plans/archive/project-agent-image.md`). `ProvisionConfig.imageFor` (`AgentImages.imageFor`,
`apps/worker/src/agent-image/images.ts`) gives the image for a project; `projectImage` asks it where a container
of the project is created: the ticket's (`provision.ts`), investigations (`ThrowawayDeps.projectId`), agent reviews'
and review agents' checkouts (`throwawayCheckout`) and a pull request's own container (`review-checkout.ts`). Runs
with no repository (the lesson writer, the prompt writer, the connector check, ticket drafts) keep the base image.

- **The base stage** (`union-agent-base:local`, or `agentBaseImage`) holds only what Union needs: git, the
  `claude` CLI and the `node` user (uid 1000) with `/workspace`. The CLI is its release binary at the pinned version,
  checked against the release's manifest, in `/usr/local/bin` (not `install.sh`, which installs under HOME, the
  volume), with `DISABLE_AUTOUPDATER=1`. `docs/plans/archive/agent-image-layers.md`.
- **What a project can choose** (`agent-image-source.ts` in core): the default, a Dockerfile whose first
  instruction is `FROM union-agent` or `FROM union-agent-base` (each such `FROM` is rewritten to the image the
  worker has, `buildableDockerfile`; `dockerfileBases` lists the ones used), or an image built elsewhere (pulled). The Dockerfile is a setting in the database, never a
  file of the repository: an agent or a fork's pull request cannot change the sandbox. It is built with no context
  (`docker build -`), so no repository file and no secret goes into it.
- **Saving builds** (`agent_images` row, `agent-images.ts`): the web writes `pending`, status `queued`, and a
  `sync_agent_image` command; the worker builds (or pulls), runs `check.ts` in a helper container of the image (the
  claude CLI runs, git, uid 1000, `HOME` is `/home/node` and writable, `/workspace`, `sleep`) and only then moves it
  to `applied`. A failure keeps `applied`, sets `failed` and the error; the output's tail is in the row, rewritten
  once a second. Every worker write names the `savedAt` it started from, so a newer save or a discard (which stops
  the build) is never overwritten. A stopped worker's unfinished saves are built again at start (`recover`).
- **Tags by content**: `union-agent-p<project>:<hash of the ids of the bases it uses and the Dockerfile>`. An
  unchanged Dockerfile does not build again; rebuilding a base it uses changes the hash, so `imageFor` builds the applied
  Dockerfile again first (shared by the runs that wait on it), and a failure there fails the step with the build's
  last lines, with no fallback to the base image. A stopped ticket container moves onto a new image at its next step
  (`DockerCli.create` recreates it on the same volumes); a running one finishes on the old one.
- **Cleanup**: after each apply the project's other tags are removed (one a container still uses stays); deleting
  the project queues `sync_agent_image`, which removes them all.

## What Union reads back

Five formats are asked for only by the editable prompt. A user's edit can drop them, so the guide tells users to
keep them, the agent page warns when an edit drops one (`missingFormats`, `prompt-formats.ts`, browser-safe), and
`agents.test.ts` keeps them in the defaults:

| Agent          | Format                                               | Read by                                  | Without it                            |
| -------------- | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `intake`       | an `Answer:` line per question                       | `client/lib/answers.ts`                  | no answer boxes                       |
| `technical`    | an `Estimated size: <n> lines of code` line          | `parseSizeEstimate` (`change-budget.ts`) | the project's budget, else none       |
| `final_review` | first line `VERDICT: APPROVED` / `CHANGES_REQUESTED` | `client/lib/verdict.ts`                  | no verdict shown                      |
| `split_plan`   | `## Slice <n>: <title>` sections with `**Spec:**`    | `parseSplitPlan` (`split-plan.ts`)       | asked once more, then the step fails  |
| `split`        | a `Slice: <n>` trailer per commit                    | `stack-trailers.ts`                      | the agent is asked to fix the history |

The worker appends every other format after the user's prompt, so an edit cannot break it:

| Agent                   | Format                                  | Defined and read in                                       |
| ----------------------- | --------------------------------------- | --------------------------------------------------------- |
| `pr_description`        | between `<pr-description>` marks        | `pr-description.ts` (`OUTPUT_RULES`, `descriptionOf`)     |
| `review_comments`       | a final `json` block of findings        | `agent-review-findings.ts`                                |
| `review_groups`         | a final `json` block of groups          | `review-grouping-format.ts`, `review-grouping-result.ts`  |
| `review_explain`        | a final `json` block                    | `review-explain-prompt.ts`, `review-explain-result.ts`    |
| `pr_replies`            | a final `json` block of replies         | `pr-reply-format.ts`                                      |
| `review_report`         | a final `json` block: the report        | `review-report-format.ts`, `review-report-result.ts`      |
| review agents           | markdown citing `path:line`             | `review-agent-prompt.ts`; links: `diff-links.ts` (core)   |
| `lesson_writer`         | a JSON array of lessons and `replaces`  | `lesson-writer.ts` (core)                                 |
| `lesson_tidier`         | the same, each replacing kept lessons   | `lesson-tidier.ts` (core)                                 |
| setup (investigation)   | a final `json` block: the proposal      | `setup/setup-prompt.ts`, `setup/setup-proposal.ts` (core) |
| `implement`, `simplify` | a last line `Refused commit: <message>` | `leftovers.ts`                                            |

A new agent whose answer is parsed puts its format in the worker's part of the prompt, not in the editable one.

## Adding a built-in agent

1. Add its id to `AGENT_IDS`, its prompt to `DEFAULT_PROMPTS`, its model to `MODEL_BY_AGENT` (or the step's to
   `MODEL_BY_STEP`) and its tools to `DEFAULT_TOOLS`. A run of its own also goes in `BuiltInRunAgent`.
2. Add its title and description to `AGENT_LABELS` (`apps/web/client/components/agents/agent-labels.ts`).
3. Run it through the worker's agent function (`agent.ts`, passed as `deps.agent`) with `modelFor`, `effortFor`, `toolsFor` and the right denied list, and send its
   events to `appendAgentLine` so its usage is counted (`agent_usage`).
4. Add it to the tables above and to the guide's agent table (`documentation/agents.md`).
   `apps/web/src/agents-docs.test.ts` fails until both name it, and until the guide shows its default model.
