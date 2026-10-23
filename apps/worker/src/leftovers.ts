// What the agent left uncommitted: staged, committed with its message, or refused by a hook for the
// user to decide.
import type { ContainerRuntime } from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

/** Kept for the page: the hash covers the whole diff. */
const MAX_DIFF_CHARS = 300_000;
const MAX_HOOK_OUTPUT_CHARS = 20_000;
const STASH_MESSAGE = 'union: changes left out after a hook refused to commit them';

/** Everything the agent left uncommitted, staged: its files, its diff and the diff's hash. */
type Leftovers = { files: string[]; diff: string; diffHash: string };

export type LeftoverCommit =
  | { kind: 'clean' }
  | { kind: 'committed' }
  /** `message` is the agent's, for the commit the user may approve. */
  | { kind: 'refused'; hookOutput: string; leftovers: Leftovers; message: string };

/** One more turn in the agent's session: its answer, or null when it could not answer. */
export type Ask = (prompt: string) => Promise<string | null>;

export function askSession(agent: AgentFn, runtime: ContainerRuntime, run: AgentRun): Ask {
  return async function ask(prompt: string): Promise<string | null> {
    const outcome = await agent(runtime, { ...run, prompt });
    return outcome.kind === 'ok' ? outcome.text : null;
  };
}

export type Refused = Extract<LeftoverCommit, { kind: 'refused' }>;

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

function sha256(text: string): string {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

/** Stages every change and describes it, or null when the working tree is clean. */
async function stageLeftovers(
  runtime: ContainerRuntime,
  container: string,
): Promise<Leftovers | null> {
  const status = await mustRunIn(runtime, container, git(['status', '--porcelain']));
  if (status.trim() === '') {
    return null;
  }
  await mustRunIn(runtime, container, git(['add', '-A']));
  const names = await mustRunIn(runtime, container, git(['diff', '--cached', '--name-only']));
  const diff = await mustRunIn(runtime, container, git(['diff', '--cached', '--binary']));
  return {
    files: names.split('\n').filter((line) => line.trim() !== ''),
    diff:
      diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n[… diff shortened]` : diff,
    diffHash: sha256(diff),
  };
}

/** The hook's output without the padding some linters add, keeping the end (where errors are). */
function hookOutputOf(stdout: string, stderr: string): string {
  const text = `${stdout}\n${stderr}`
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return text.length > MAX_HOOK_OUTPUT_CHARS ? `…\n${text.slice(-MAX_HOOK_OUTPUT_CHARS)}` : text;
}

function leftoversPrompt(files: string[]): string {
  const list = files.map((file) => `\`${file}\``).join(', ');
  return `You left changes uncommitted${list ? `: ${list}` : ''}. Commit them now, with a message that follows this repository's commit conventions (see \`git log\` and its commit rules). If a git hook refuses the commit, do not bypass it with \`--no-verify\`: leave the changes staged, say why the hook refuses them, and end your reply with the line \`Refused commit: <the commit message>\`.`;
}

/**
 * The agent's message for its leftover changes: from its report, else asked for. Null when the agent
 * committed them itself meanwhile.
 */
async function agentMessage(
  runtime: ContainerRuntime,
  container: string,
  { report, ask, files }: { report: string; ask: Ask; files: string[] },
): Promise<string | null> {
  const proposed = proposedMessage(report);
  if (proposed) {
    return proposed;
  }
  const reply = await ask(leftoversPrompt(files));
  if (!(await stageLeftovers(runtime, container))) {
    return null;
  }
  const message = reply === null ? null : proposedMessage(reply);
  if (!message) {
    throw new Error(`The agent left changes uncommitted and gave no commit message for them`);
  }
  return message;
}

/**
 * Commits whatever the agent left uncommitted, so the push contains everything it did, always with
 * the agent's own message (Union never writes one). When the repository's hook refuses it, the
 * changes stay staged and the refusal is returned for the user.
 */
export async function commitLeftovers(
  runtime: ContainerRuntime,
  container: string,
  agent: { report: string; ask: Ask },
): Promise<LeftoverCommit> {
  const staged = await stageLeftovers(runtime, container);
  if (!staged) {
    return { kind: 'clean' };
  }
  const message = await agentMessage(runtime, container, { ...agent, files: staged.files });
  if (message === null) {
    return { kind: 'committed' };
  }
  const commit = await runIn(runtime, container, git(['commit', '-m', message]));
  if (commit.exitCode === 0) {
    return { kind: 'committed' };
  }
  // The hook may have changed the index while it ran: described again, as the user will see it.
  const leftovers = await stageLeftovers(runtime, container);
  const withoutHooks = git(['commit', '--no-verify', '--dry-run', '--quiet', '-m', message]);
  const dryRun = leftovers ? await runIn(runtime, container, withoutHooks) : null;
  if (!leftovers || dryRun?.exitCode !== 0) {
    const detail = hookOutputOf(commit.stdout, commit.stderr);
    throw new Error(
      `Committing the agent's leftover changes failed (exit ${commit.exitCode}): ${detail}`,
    );
  }
  return {
    kind: 'refused',
    hookOutput: hookOutputOf(commit.stdout, commit.stderr),
    leftovers,
    message,
  };
}

export type Decision =
  | { kind: 'applied' }
  /** The changes are not the ones the user decided on: they must decide again. */
  | { kind: 'changed'; leftovers: Leftovers | null };

/** Commits the refused changes without the hooks, or sets them aside in a stash. */
export async function applyDecision(
  runtime: ContainerRuntime,
  container: string,
  decision: { resolution: 'commit' | 'discard'; message: string; diffHash: string },
): Promise<Decision> {
  const leftovers = await stageLeftovers(runtime, container);
  if (leftovers?.diffHash !== decision.diffHash) {
    return { kind: 'changed', leftovers };
  }
  await mustRunIn(
    runtime,
    container,
    decision.resolution === 'commit'
      ? git(['commit', '--no-verify', '-m', decision.message])
      : git(['stash', 'push', '--include-untracked', '-m', STASH_MESSAGE]),
  );
  return { kind: 'applied' };
}

const PROPOSED = /^\s*Refused commit:\s*(?<message>.+?)\s*$/gmu;

/** The message the agent asked for at the end of its report (`Refused commit: …`), if any. */
export function proposedMessage(report: string): string | null {
  const last = [...report.matchAll(PROPOSED)].at(-1)?.groups?.message ?? '';
  const message = last.replaceAll(/^[`"']+|[`"']+$/gu, '').trim();
  return message === '' ? null : message;
}

/** Tells the agent what to do when a hook refuses its commit, so the user can decide. */
export const COMMIT_HOOK_HINT =
  '\n\nIf a git hook refuses one of your commits for a reason outside this task (for example warnings already in a file you had to change), do not bypass it with `--no-verify`. Leave those changes staged, explain in your report why the hook refuses them, and end the report with the line `Refused commit: <the commit message you wanted>`. The user then decides whether to commit them without the hooks.';
