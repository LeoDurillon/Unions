# union-next — spec

A local Kanban over a GitHub Project. Moving a ticket to **In Progress** spawns a Docker container that runs an
agent pipeline (planning → implementation → review) on the project's repo, using the user's Claude Max subscription.
Everything the agent does is mirrored to the GitHub issue.

## Areas

- [Flow](flow.md): a ticket from creation to Done, step by step.
- [Stack](stack.md): layers, process and container model, memory, token usage, GitHub mapping.
- [Ticket flows](ticket-flows.md): which pipeline steps a ticket runs.
- [Custom agents](custom-agents.md): the user's own steps, prompt written from a role, placed in flows.
- [Ticket dependencies](ticket-dependencies.md): a ticket's parent, the start gate and stacked branches.
- [Pull requests](pull-requests.md): the Pull requests tab, Current reviews, posting a review, CI checks.
- [Project instructions](project-instructions.md): free text sent to every agent run of a project.
- [Memory](memory.md): lessons per agent step, curated from the user's feedback.
- [Investigations](investigations.md): one-off agent runs on a custom prompt.
- [Rebase](rebase.md): bringing a ticket's branch onto the latest base.
- [Simplify history](simplify-history.md): rewriting a branch's commits for review.
- [Stacks of pull requests](pr-stacks.md): a ticket's pull request split into stacked ones, one per part of its spec.
- [Preview environments](preview-environments.md): running a ticket's or a reviewed PR's branch with compose.
- [MCP servers for agents](mcp-servers.md) (planned): claude.ai connectors built, other servers designed.

## Decisions

- One repo per project (one board per GitHub Project).
- Planning runs first; implementation starts only after the last planning step the ticket runs is approved. A
  ticket's flow says which planning steps it runs; implementation and final review always run (see [Ticket flows](ticket-flows.md)).
- One GitHub comment per step, edited in place on revision.
- Parallel tickets, capped by a concurrency limit (Max usage limits).
- Fresh codebase. The earlier POCs (`claude-auto`, `Union`) are context only.
- One persistent container per ticket, with one HOME volume and one workspace volume per ticket.
- The host owns every GitHub write and pushes the ticket's branch. The container holds no GitHub credentials.
- Memory (feedback + lessons) lives in the database.
- GitHub access per project: a personal access token (classic or fine-grained) or an installation of one global
  GitHub App (App ID + private key stored once; installation tokens are minted per use and expire after an hour).
  Fine-grained tokens and apps cannot reach Projects owned by a user account: those need a classic token.
- Each agent with a model (the pipeline steps) has an editable prompt, model, thinking effort and tools in Agent
  settings. The effort is passed as `claude --effort` (low, medium, high, xhigh, max); Default passes nothing, so
  Claude Code decides. The rebase, the history simplification, the split into a stack and the PR description use the implementer's model
  and effort.
- Final review: the user decides on `CHANGES_REQUESTED` (no automatic loop); the reviewer states the last check result
  instead of re-running the checks.
- Rebase reuses the implementation agent (`--resume` + a rebase prompt), and the final review always re-runs
  after it.

## Open risks

1. OAuth refresh inside a ticket volume may invalidate the host login (untested; needs a test near token expiry).
   Fallback: `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`.
2. Hono SSE behaviour on client disconnect in production (checked in the skeleton).
3. Max rate limit under parallel tickets → `rate_limited` is a first-class ticket state.
4. MCP OAuth tokens (Figma) are readable by the agent during the runs that use them; a prompt injection in a
   repository could send one away. Accepted per server; revoke it in Figma if a run looks wrong.

## Out of scope for now

Multi-user, auth on the web UI, hosted deployment, webhooks.
