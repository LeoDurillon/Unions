# Plan: a long-lived Claude token for the agent containers

Status: steps 2 to 4 built (2026-11-17, branch `long-lived-token`); step 1 is the real run with a token, left. First item of "Security first" in the
[plans index](README.md).

## The problem

Every agent container gets the host's full Claude login: `seedCredentials` (`apps/worker/src/provision.ts`)
copies `claudeAiOauth` from `~/.claude/.credentials.json` (`UNION_CLAUDE_CREDENTIALS`) into
`/home/node/.claude/.credentials.json`. That object holds the access token **and the refresh token**, and the
containers have open network access. So:

- an agent (or a prompt injection in a repository) can read a credential that renews itself, and send it away;
- when one container's CLI refreshes, the rotated refresh token can retire the one the host and the other
  containers hold (spec, open risk 1).

`claude setup-token` makes a long-lived OAuth token (about a year) for the same subscription, with no refresh
token. The CLI uses it from `CLAUDE_CODE_OAUTH_TOKEN`. A leaked one still runs on the subscription until revoked,
but it cannot renew itself, it cannot log the host out, and it can be revoked alone.

## What changes

Optional. **No token set: nothing changes**, containers get the `claudeAiOauth` copy of
`~/.claude/.credentials.json` as today. Token set: containers get the token and **no** credentials file.

### Step 1: check the token by hand (no code)

Run `claude setup-token` on the host, then in a throwaway agent container (ticket id 9001, per
`docs/architecture/testing.md`) with no `.credentials.json`:

- `CLAUDE_CODE_OAUTH_TOKEN=… claude -p` answers, `--resume` works, and `stream-json` still carries
  `rate_limit_event` (the rate-limit parsing in `agent/rate-limit.ts` relies on it);
- not the connectors: they are checked once the token is in Settings (step 4).

Write the results here before step 2.

### Step 2: where Union reads the token

Decided: entered in Union settings (Settings → Claude) and kept in the database, like the integrations' secrets.
The worker reads it each time a container is seeded, so replacing it needs no restart. It never reaches the
browser: the settings API says only whether one is set (and when it was saved), and accepts a new one or a removal.
`union.sqlite` is plain text until finding 2 is fixed; the token is no worse off there than the GitHub and Jira
tokens, and it cannot renew itself.

### Step 3: how a run gets it

`seedCredentials` takes the token when there is one and writes it to `/home/node/.claude/oauth-token` (mode 600,
owner `node`) instead of `.credentials.json`; it removes a `.credentials.json` left from before, so existing HOME
volumes stop holding the refresh token.

The token must not go on a command line (finding 3: `docker exec -e` shows in the process list). `claudeArgs`
wraps the call when the token file exists:

```
sh -c 'CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.claude/oauth-token)" exec claude "$@"' claude -p …
```

Same for `claude mcp list` (`mcp-check.ts`). Every path that seeds goes through `seedCredentials`
(`provision.ts`, `throwaway-container.ts`, `review/agent-review-target.ts`), so one change covers tickets,
investigations, reviews and side runs.

### Step 4: settings, status and the guide

- Settings → Claude (or wherever the login is shown) says which one the agents use: "long-lived token" or "your
  full login (refresh token included)", with how to make a token. Never the token itself.
- A run that fails with an auth error while the token is in use fails (no fallback to the full login) and says
  the token was revoked or expired, and how to replace it in Settings.
- Connectors: the connectors list (`mcp-check.ts`, `claude mcp list` in a throwaway container) seeds through
  `seedCredentials`, so with a token set it shows what the token reaches. Saving or removing the token re-runs
  that check, so the list is never from the other login. If the connectors do not load with the token, the list
  shows none and the agents' connector tools are unavailable while it is set; nothing falls back.
- Guide: `installation.md` (optional step after logging in), `settings.md` (the variable), `troubleshooting.md`
  (expired token). README security model and the spec's open risk 1 updated; `AGENTS.md` rule ("Seed only the
  `claudeAiOauth` credential") becomes "seed the token, or else only `claudeAiOauth`".

### Tests

- `provision.test.ts`: with a token file, the container gets `oauth-token` and no `.credentials.json`; without
  one, today's behaviour; an old `.credentials.json` is removed.
- `agent-args.test.ts`: the wrapped command, and the token never appears in the args.
- One real run against Docker (ticket 9001), cleaned up after.

## Decisions

1. Decided (2026-11-17): the token is entered in Settings and kept in the database. No token: the
   credentials copy as today.
2. Decided: a token is set but Claude rejects it (revoked, expired): the run fails and says to replace the
   token. Never a fallback to the full login.
3. Decided: whether connectors work with the token is read from the connectors list once a token is set (no
   separate check). No fallback to the full login for connector runs.
