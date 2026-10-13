# Plan: MCP servers for agents

Status: designed in `SPEC.md` ("MCP servers for agents (planned)"), committed as `959eb59`. Not built.

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

## Open questions

- Per-project overrides from the start, or global servers only?
- stdio servers that need a secret: allow with the "credentials visible to the agent" warning, or HTTP only?
