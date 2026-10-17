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
`pr-stacks.ts` (browser-safe, `@union/core/pr-stacks`): `pullRequestStacks` groups pull requests by stack, a PR
sitting on the one whose head branch it targets, bottom first.
Drizzle schema and migrations, the pure ticket state machine (`states.ts`), ticket dependencies
(`ticket-links.ts`: `setParent`, `ticketBase`; the start gate `blockingParent` is in `tickets.ts`), the
`ContainerRuntime` interface and its Docker CLI implementation.
The event log (`events`) is typed: `event-payloads.ts` gives the payload of every event type, and `emitEvent`
takes a `NewEvent` from `event-catalog.ts`, so a new event type is added there first. Read one back with
`isEvent(row, '<type>')` (browser-safe, `@union/core/event-catalog`), not by probing its payload by hand.
Readers of the log (rule deliveries, notifications) keep their place in `event_cursors` through
`event-cursors.ts` (`unreadEvents` starts a new reader at the end of the log). `notifications.ts` is the pure
`notificationFor(event, subject)`: which events notify the user (a step waiting for approval, failed, refused or
paused by the usage limit, a blocked start, a merged or closed PR, an investigation that ended, a failed rule) and
with what text; `STEP_TITLES` (in `states.ts`) names the steps for it and for the UI.
The agents' raw output is not an event: `appendAgentLine` writes it to `agent_log` (`agent-log.ts`), each line
with the last `events.seq` at the time, and `readLog` merges both tables into one Log in that order.
