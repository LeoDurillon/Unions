// How agents log in to Claude: the long-lived token from Union settings, else a copy of the host's login.
// Seeds the container with one of them and Union's CLI settings, and wraps each `claude` call so the token never
// reaches a command line.
import { readFile } from 'node:fs/promises';

import { AGENT_HOME, type ContainerRuntime } from '@union/core';

const CREDENTIALS_FILE = `${AGENT_HOME}/.claude/.credentials.json`;
/** Where the token is written; the `claude` wrapper reads it into `CLAUDE_CODE_OAUTH_TOKEN`. */
const TOKEN_FILE = `${AGENT_HOME}/.claude/oauth-token`;
/** The CLI's user settings: Union writes the whole file; a repository's own settings still load. */
const SETTINGS_FILE = `${AGENT_HOME}/.claude/settings.json`;

/** Where the login comes from: the token, when one is set, else the host's credentials file. */
export type ClaudeLoginSource = {
  /** Host path of the Claude credentials file to copy the login from. */
  credentialsPath: string;
  /** The long-lived token from Union settings; absent or null: the login is copied. */
  claudeToken?: () => string | null;
  /** The context, in tokens, at which the CLI compacts a session; absent or null: the CLI's own. */
  autoCompactWindow?: () => number | null;
};

/** The CLI's user settings Union gives agents: only the auto-compact window, when one is set. */
export function claudeSettings(autoCompactWindow: number | null): string {
  return JSON.stringify(autoCompactWindow === null ? {} : { autoCompactWindow });
}

/** What a run without a Claude login fails with: what to do, never the file's contents. */
function notLoggedIn(credentialsPath: string): string {
  return `Claude is not logged in on this machine (no subscription login in ${credentialsPath}): run \`claude\` and log in (see Installation), or set a token in Union settings → Claude login, then try again.`;
}

/** The subscription login in the credentials file; throws `notLoggedIn` when there is none. */
async function readOauth(credentialsPath: string): Promise<unknown> {
  let raw: unknown = null;
  try {
    raw = JSON.parse(await readFile(credentialsPath, 'utf8'));
  } catch {
    // Missing or unreadable: the same as no login.
  }
  const oauth =
    typeof raw === 'object' && raw !== null && 'claudeAiOauth' in raw ? raw.claudeAiOauth : null;
  if (!oauth) {
    throw new Error(notLoggedIn(credentialsPath));
  }
  return oauth;
}

/**
 * Seeds one login and empties the other's file, which a HOME volume may still hold: the token (it
 * cannot renew itself), else only the `claudeAiOauth` credential. No MCP tokens, no history. Then the
 * CLI settings, every run, so a changed auto-compact window applies to the next run.
 */
export async function seedCredentials(
  runtime: ContainerRuntime,
  container: string,
  source: ClaudeLoginSource,
): Promise<void> {
  const token = source.claudeToken?.() ?? null;
  if (token === null) {
    const oauth = await readOauth(source.credentialsPath);
    await runtime.writeFile(container, TOKEN_FILE, '');
    await runtime.writeFile(container, CREDENTIALS_FILE, JSON.stringify({ claudeAiOauth: oauth }));
  } else {
    await runtime.writeFile(container, CREDENTIALS_FILE, '{}');
    await runtime.writeFile(container, TOKEN_FILE, token);
  }
  await runtime.writeFile(
    container,
    `${AGENT_HOME}/.claude.json`,
    JSON.stringify({ hasCompletedOnboarding: true }),
    '644',
  );
  await runtime.writeFile(
    container,
    SETTINGS_FILE,
    claudeSettings(source.autoCompactWindow?.() ?? null),
    '644',
  );
}

/** Exports the token from its file when it holds one, then runs the command it was given. */
const WITH_TOKEN = `if [ -s ${TOKEN_FILE} ]; then CLAUDE_CODE_OAUTH_TOKEN="$(cat ${TOKEN_FILE})"; export CLAUDE_CODE_OAUTH_TOKEN; fi; exec "$@"`;

/** A `claude …` command run with the container's login: the token is read inside, never passed. */
export function withClaudeLogin(command: readonly string[]): string[] {
  return ['sh', '-c', WITH_TOKEN, 'claude-login', ...command];
}

const REFUSED_LOGIN =
  /authentication_error|invalid api key|oauth token (?:has )?(?:expired|been revoked)|please run \/login|API Error: 401/iu;

/** Appended to a failure where Claude refused the login: which login, and how to renew it. */
export function refusedLoginNote(message: string): string {
  return REFUSED_LOGIN.test(message)
    ? ' Claude refused the login: if a token is set in Union settings → Claude login, it was revoked or has expired; make a new one with `claude setup-token` and save it there. Otherwise run `claude` on this machine and log in again.'
    : '';
}
