# packages/core

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

`packages/core`: shared code. `agents.ts` holds the default agent prompts and models; edits made in the UI's
Agent settings are stored in `agent_configs` (overrides only, Reset deletes the row) and the worker resolves them
on every run (`resolveAgent`, `modelFor`, `effortFor`, `toolsFor`; the effort becomes `claude --effort`, unset
leaves the CLI's default). Change a default there, not in the worker. Ticket agents
get `sharedPrompt` first: the shared instructions, then the project's own (`config.instructions`, project
settings → Instructions; investigations get those too, via `projectInstructions`).
`agent-tools.ts` holds each step's default allowed tools and the tool list agents pick from (Claude Code's tools,
the rules the defaults use, the account's claude.ai connectors from `mcp-connectors.ts`, and the user's additions
in `agent_tools`). A run loads the connectors only when its tools include one (`connectorEnv` in the worker's
`agent.ts`); the worker's `ConnectorChecker` (`mcp-check.ts`) reads them on request. Denied rules (`BASE_DENIED`,
`IMPLEMENT_DENIED` in the worker) are not editable and always win over a selected tool.
`investigations.ts`: one-off agent runs on a custom prompt (records, claim, finish, cancel, follow-ups); defaults
in the browser-safe `investigation-defaults.ts`.
Drizzle schema and migrations, the pure ticket state machine (`states.ts`), ticket dependencies
(`ticket-links.ts`: `setParent`, `ticketBase`; the start gate `blockingParent` is in `tickets.ts`), the
`ContainerRuntime` interface and its Docker CLI implementation.
