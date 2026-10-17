# MCP servers for agents (planned)

**Built first: claude.ai connectors.** The account's claude.ai connectors (Figma…) reach every agent container
through the Claude login alone: their tokens stay with Anthropic. Union settings → Connectors reads them
(`claude mcp list` in a throwaway `union-mcp-check` container, no model run) into `mcp_connectors`; each is offered
in the tool list as `mcp__claude_ai_<Name>` (all its tools) and selected per agent or investigation like any tool. A
run gets `ENABLE_CLAUDEAI_MCP_SERVERS=true` only when its tools include a connector, `false` otherwise, so runs
without one no longer load the connectors' tools. The rest of this section (servers that are not connectors) is
still planned.

Agents can use MCP servers the user configures (an error tracker, docs, a database, a design tool such as Figma),
chosen per agent like the tools. Today an agent container gets only the Claude login (`claudeAiOauth`): no
`~/.claude.json`, so no MCP servers. Servers are passed on each run, never installed in the container.

## Constraint that shapes it

An agent has Bash and can read anything in its container, and repository content can carry prompt injections. A
secret placed in the container is a secret the agent can print or send away. The rule "containers never hold GitHub
credentials" extends to every credential that can be kept out.

**Decided exception: OAuth servers.** A server that only signs in through the browser (Figma's official
`https://mcp.figma.com/mcp`) has its OAuth token copied into the container for the runs that use it: the user
accepts this per server when adding it, and the narrowing below applies. Building it changes the AGENTS.md rule
"Never copy `mcpOAuth` into a container" to allow exactly this, and nothing else.

## Configuration

- **Registry** (Union settings → MCP servers, global like the tool list), table `mcp_servers`:
  `name` (slug, the `mcp__<name>__*` prefix), `transport` (`http` or `stdio`), for `http` the `url` and either secret
  `headers` or `auth = 'oauth'`, for `stdio` the `command`, `args` and secret `env`. Secrets (headers, variables, the
  OAuth token in `oauth`) are stored like the GitHub token (plain text, local app) and never sent to the browser: the
  page shows which are set and whether the server is signed in, not their values. A server whose credentials reach
  the container (OAuth, or stdio with variables) needs a ticked "agents using it can read its credentials during a
  run" when added, and is labelled so wherever it can be selected.
- **Per agent**: `agent_configs.mcp_servers` lists the servers an agent may use (multi-select under its tools);
  investigations pick theirs in the new-investigation form. Nothing is enabled by default.
- **Per project** (if wanted, see [Open questions](#open-questions)): a project can override a server's `url`, headers or variables, for
  example its own Sentry project.

## Runtime

- Each run gets `--mcp-config '<json>' --strict-mcp-config` built from the agent's servers: only those servers load,
  whatever is in the container. Their tools are allowed with `--allowedTools mcp__<name>` (the whole server); denied
  rules still win.
- **HTTP servers go through the worker.** The worker listens on a proxy port (`UNION_MCP_PROXY_PORT`); the run's
  config points the server at `http://host.docker.internal:<port>/mcp/<run token>/<name>`. The proxy checks the run
  token (random, valid only while that run lasts), adds the real headers and forwards to the server. The secrets stay
  in the worker; the container only ever sees a token that dies with the run. Agent containers get
  `--add-host host.docker.internal:host-gateway`; in compose the worker publishes the port to the host.
- **stdio servers run inside the container**, started by Claude Code with the configured command (`npx` and `bunx` are
  in the agent image; Python servers need `uvx`, so a project image). Their `env` secrets are therefore visible to the
  agent: the settings page marks such a server "credentials visible to the agent", and an HTTP server (or an HTTP
  bridge) is preferred whenever the server needs a secret.
- **Never GitHub write access**: a GitHub MCP server with a token would let an agent write to GitHub around the
  host. The registry refuses servers whose secrets look like GitHub tokens (`ghp_`, `github_pat_`, `ghs_`), and the
  docs say why.
- **Log**: MCP tool calls show in the Log tab like other tools. The proxy records one event per call (server, tool
  name, duration, status), never the bodies.

## OAuth servers (Figma)

Claude Code signs in to such servers itself, as an approved client (Figma lets only listed clients connect), with
`claude mcp login <name> --no-browser`, which prints the authorization URL and waits for the redirect URL to be
pasted back. Union drives that and keeps the token.

1. **Sign in** (Union settings → MCP servers → Sign in): a `mcp_login` command. The worker starts a sign-in
   container `union-mcp-<name>` (Claude login seeded, only that server configured), runs the login there, and
   stores the printed URL on the server (`login_status: waiting`); the page shows it as a link.
2. The user approves in Figma. The browser then goes to `http://localhost:<port>/callback?code=…` and fails to load:
   that is expected. The user pastes that address into the page; the worker writes it to the waiting login.
3. The worker reads the server's `mcpOAuth` entry from the sign-in container's `~/.claude/.credentials.json`, stores
   it on the server (`oauth`), marks it signed in, and removes the container. A failure or timeout (10 minutes)
   leaves it signed out with the reason.
4. **Each run** of an agent that selected the server: the worker merges the stored entry into the container's
   `.credentials.json` (next to the Claude login) and passes the server with `--mcp-config` at its real URL (not
   through the proxy: the token is Claude Code's own). Claude Code refreshes it when needed.
5. **After the run** (success, failure or cancel) the worker reads the entry back, keeps it if Claude Code refreshed
   it (newer expiry), and removes it from the container. Runs using the same OAuth server do not overlap: the next one
   waits for a slot on that server, so two copies never refresh concurrently and invalidate each other.
6. **Expired or revoked**: the run's MCP tools fail and the agent carries on without them; the worker marks the
   server "sign in again" (from the run's MCP status) and the next runs skip it until then.

Narrowing: the token is in a container only during runs that selected the server, never in investigations or
agents that did not, never in the image, and never in the browser. It is still readable by the agent during those
runs; that is the accepted risk.

Checked on 2026-10-14 (details in [`docs/plans/mcp-servers.md`](../plans/mcp-servers.md)): the login refuses a
pipe and works under a pseudo-terminal; and claude.ai connectors (Figma among them, once connected in claude.ai)
already reach agent containers through the Claude login alone, without any token copied. The plan now prefers
connectors for OAuth servers and keeps this flow as a fallback. Paused until a Figma account with MCP access is
available to test with.

## Order of work

1. Registry and per-agent selection, `--mcp-config`/`--strict-mcp-config`, and OAuth servers with the sign-in flow
   (Figma first): the two checks above, tests with a fake MCP server, then one real Figma run.
2. HTTP servers with header secrets through the proxy.
3. stdio servers (no secrets, or secrets marked visible).
4. Per-project overrides and a "Test" button (the worker starts the server once and lists its tools).

## Open questions

- Per-project overrides from the start, or global servers only?
- For stdio servers that need a secret: allow it with the warning, or HTTP only?
