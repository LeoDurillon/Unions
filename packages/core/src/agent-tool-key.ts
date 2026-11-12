// What an agent's tool call is about, for counting: the command family and shape, the file read,
// the skill or subagent.

/** The tool and what it was used on; `variant` is the command's shape, for Bash only. */
export type ToolKey = { tool: string; target: string; variant: string };

const REPO_PREFIX = '/workspace/repo/';
const VARIANT_LENGTH = 120;
const RUNNERS = new Set(['pnpm', 'npm', 'npx', 'yarn', 'bun', 'bunx']);
/** Runner words that come before the tool they run. */
const RUNNER_WORDS = new Set(['exec', 'run', 'dlx', 'x', '--silent', '-s', '-r', '--recursive']);
/** Runner flags followed by a value. */
const RUNNER_VALUE_FLAGS = new Set(['--filter', '-F', '-C', '--dir', '--cwd', '-w', '--workspace']);
const SUMMARY_FLAGS = new Set([
  '--stat',
  '--name-only',
  '--name-status',
  '--shortstat',
  '--numstat',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

/** The command's first part: without leading `cd`, variables and `timeout`, before a pipe or `&&`. */
export function mainCommand(command: string): string {
  let rest = command.trim().split('\n')[0] ?? '';
  for (;;) {
    const stripped = rest
      .replace(/^cd\s+\S+\s*(?:&&|;)\s*/u, '')
      .replace(/^[A-Z_][A-Z0-9_]*=\S*\s+/u, '')
      .replace(/^timeout\s+\S+\s+/u, '');
    if (stripped === rest) {
      break;
    }
    rest = stripped;
  }
  return rest.split(/\s*(?:\|\||&&|\||;|\s2>|\s>)/u)[0]?.trim() ?? '';
}

/** The tool a runner (`pnpm exec jest`, `npx tsc`, `pnpm --filter api test`) runs. */
function runnerTool(words: string[]): string {
  let at = 1;
  while (at < words.length) {
    const word = words[at] ?? '';
    if (RUNNER_VALUE_FLAGS.has(word)) {
      at += 2;
    } else if (RUNNER_WORDS.has(word) || word.startsWith('--filter=') || word.startsWith('-')) {
      at += 1;
    } else {
      return word;
    }
  }
  return words[0] ?? '';
}

/** Git options followed by a value, before the subcommand. */
const GIT_VALUE_FLAGS = new Set(['-C', '-c']);

function gitTarget(words: string[]): string {
  const sub =
    words.find(
      (word, at) => at > 0 && !word.startsWith('-') && !GIT_VALUE_FLAGS.has(words[at - 1] ?? ''),
    ) ?? '';
  if (sub !== 'diff' && sub !== 'show') {
    return `git ${sub}`.trim();
  }
  if (words.some((word) => SUMMARY_FLAGS.has(word))) {
    return `git ${sub} --stat`;
  }
  return words.includes('--') ? `git ${sub} -- <path>` : `git ${sub}`;
}

/** The command family: `git diff`, `git diff --stat`, `jest`, `tsc`, `sed`… */
export function commandTarget(command: string): string {
  const words = mainCommand(command).split(/\s+/u).filter(Boolean);
  const first = words[0] ?? '';
  if (first === 'git') {
    return gitTarget(words);
  }
  const tool = RUNNERS.has(first) ? runnerTool(words) : first;
  return tool.split('/').at(-1) ?? tool;
}

/** The command's form: its family and the flags it was given, without their values or arguments. */
export function commandVariant(command: string): string {
  const flags = mainCommand(command)
    .replaceAll(/"[^"]*"|'[^']*'|`[^`]*`/gu, '')
    .split(/\s+/u)
    .filter((word) => word.startsWith('-') && word !== '--')
    .map((word) => word.split('=')[0] ?? word);
  return [commandTarget(command), ...flags].join(' ').slice(0, VARIANT_LENGTH);
}

function relative(path: string): string {
  return path.startsWith(REPO_PREFIX) ? path.slice(REPO_PREFIX.length) : path;
}

/** What a `tool_use` block is about. */
export function toolKey(name: string, input: unknown): ToolKey {
  const fields = isRecord(input) ? input : {};
  switch (name) {
    case 'Bash': {
      const command = text(fields, 'command');
      return { tool: name, target: commandTarget(command), variant: commandVariant(command) };
    }
    case 'Read': {
      return { tool: name, target: relative(text(fields, 'file_path')), variant: '' };
    }
    case 'Skill': {
      return { tool: name, target: text(fields, 'skill'), variant: '' };
    }
    case 'Agent':
    case 'Task': {
      return {
        tool: name,
        target: text(fields, 'subagent_type') || 'general-purpose',
        variant: '',
      };
    }
    default: {
      return { tool: name, target: '', variant: '' };
    }
  }
}
