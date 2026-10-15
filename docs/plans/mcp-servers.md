# Plan: MCP servers for agents

Status: claude.ai connectors built and merged into `main` (2026-10-15, `139f122`): Agent settings → Connectors reads the
account's connectors, an agent selects one like a tool, runs without one get `ENABLE_CLAUDEAI_MCP_SERVERS=false`.
Checked for real: a fresh agent container lists `claude.ai Figma … ✔ Connected`; two real Figma runs on Sonnet
(investigations 9 and 10). Figma's screenshots and assets come as links to `curl`, which agents are refused, so a run
with Figma is told (`connectorHints`, `--append-system-prompt`) to call `get_screenshot` with
`enableBase64Response: true`: the image then comes in the tool result, and run 10 described it. Next: the servers that
are not connectors (below). Previously paused (2026-10-14). Designed in `SPEC.md` ("MCP servers for agents (planned)"), committed as
`959eb59`; the checks below (2026-10-14) change the plan for OAuth servers. Waiting for a Figma account with access
to its MCP server to test with.

Summary: agents can use MCP servers configured in Agent settings, selected per agent like the tools. Runs get
`--mcp-config … --strict-mcp-config`; HTTP servers with secrets go through a worker proxy so secrets stay out of the
container; OAuth servers (Figma) are signed in through `claude mcp login --no-browser` driven by the worker, with the
token copied into the container only for runs that selected the server (accepted risk, opt-in per server).

## Step 1 (first to build)

Registry and per-agent selection, `--mcp-config`/`--strict-mcp-config`, OAuth servers with the sign-in flow (Figma
first). Before building, verify:

1. `claude mcp login --no-browser` accepts the pasted redirect URL from a pipe (else run it under a pseudo-terminal).
2. An `mcpOAuth` entry copied into another container is used without signing in again (and how it is keyed in
   `.credentials.json`).

Then tests with a fake MCP server, then one real Figma run. Later steps: HTTP servers through the proxy, stdio
servers, per-project overrides and a "Test" button.

## Checks done (2026-10-14, Claude Code 2.1.296 in the agent image)

Run in a scratch agent container (`union-t9001-mcp`, removed after) seeded like a real run (`seedCredentials`: only
`claudeAiOauth` and the onboarding flag). No model ran.

| Check                                             | Result                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude.ai connectors in an agent container        | **Yes.** With only the Claude login, `claude mcp list` shows the account's connectors (`claude.ai Claude Docs … ✔ Connected`). A connector's token stays with Anthropic: nothing is copied into the container.                                                                                                                                           |
| Their tool names                                  | `mcp__claude_ai_<Name>__<tool>` (spaces become `_`), e.g. `mcp__claude_ai_Figma__…`.                                                                                                                                                                                                                                                                     |
| Turning connectors off                            | `ENABLE_CLAUDEAI_MCP_SERVERS=false` hides them all. `--strict-mcp-config` does **not**.                                                                                                                                                                                                                                                                  |
| Choosing which an agent gets                      | Runs use the default permission mode with `--allowedTools`, so a connector's tools are refused unless listed; unselected ones can also be put in `--disallowedTools`.                                                                                                                                                                                    |
| `claude mcp login <name> --no-browser`            | Exists. Refuses a pipe ("stdin isn't a terminal"); **works under a pseudo-terminal** (`script -qfc …`): prints the authorization URL, reads the pasted redirect URL (checked against Figma's server with a dummy URL, rejected as expected). It also signs in claude.ai connectors that need it (`claude mcp login "claude.ai Figma"`, from a terminal). |
| An `mcpOAuth` entry copied into another container | Not checked: needs a real Figma sign-in. Only matters for the fallback below.                                                                                                                                                                                                                                                                            |

**Side finding, worth fixing on its own:** every agent run today loads the user's claude.ai connectors. Their tools
are refused (not in `--allowedTools`) but are still listed to the model, taking context. Setting
`ENABLE_CLAUDEAI_MCP_SERVERS=false` on runs (until an agent selects a connector) removes them.

## Revised direction (from the checks)

- **OAuth servers through claude.ai connectors.** The user connects Figma (or any connector) once in claude.ai
  (Settings → Connectors; on a Team or Enterprise organization an admin may have to allow it). Agent settings list
  the account's connectors (read from `claude mcp list` in a worker-run container, or entered by name) and an agent
  selects them like tools; its runs get `ENABLE_CLAUDEAI_MCP_SERVERS` on and `mcp__claude_ai_<Name>` in
  `--allowedTools`, every other connector in `--disallowedTools`. No token in the container, no read-back after the
  run, no one-run-at-a-time per server, and the AGENTS.md rule "never copy `mcpOAuth`" stays as it is. Remaining
  risk: the container already holds the Claude login, which reaches the connectors anyway.
- **The `mcpOAuth` copy flow becomes a fallback** for OAuth servers that are not claude.ai connectors, driven under a
  pseudo-terminal (`script`), and only if needed.
- **HTTP servers with secrets through the worker's proxy, over a Docker network** (`union-mcp`, joined by the worker
  and by each agent container for its run), not a host port with `host.docker.internal`: nothing published on the
  host, like previews.
- **Settings:** a global "MCP servers" page beside Agent settings and GitHub App; selection per agent in Agent
  settings; secrets write-only (names only reach the browser, like preview secrets); global servers only at first.

To resume: connect Figma in claude.ai with an account that has access, check `claude mcp list` on the host, then
repeat the scratch-container check and one real Figma run (uses the Claude subscription: ask first).

## Open questions

- ~~Per-project overrides from the start, or global servers only?~~ Global only at first (proposed).
- stdio servers that need a secret: allow with the "credentials visible to the agent" warning, or HTTP only?
  (Proposed: HTTP through the proxy first, stdio with secrets later, labelled.)
- Listing the account's connectors for the settings: from `claude mcp list` in a worker-run container, or typed by
  name?
