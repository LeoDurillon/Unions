// What an agent review opened of the change, read from its log: the changed files it never diffed or read.
// A file counts as opened when the agent diffed it (alone or in a folder), read it, or printed it
// (`cat`, `sed`…). A `git diff` too large for the CLI is saved to a file: it counts only once the
// agent read that file. Pure.

import { contentBlocks, isRecord } from '../agent/agent-activity';

/** A changed file and its changed lines. */
export type ReviewedFile = { path: string; lines: number };

/** The files the review had to read (the ignored ones left out), and those it never opened. */
export type AgentReviewCoverage = { files: number; lines: number; unopened: ReviewedFile[] };

/** What one tool call showed: the whole change, or these paths (files or folders). */
type Shown = 'all' | string[];

/** `git diff` options that print names or counts, not the lines. */
const SUMMARY_FLAGS = [
  '--stat',
  '--name-only',
  '--name-status',
  '--numstat',
  '--shortstat',
  '--dirstat',
];
const PRINTERS = new Set(['cat', 'sed', 'head', 'tail', 'nl', 'less']);
const SAVED = /Full output saved to: (?<path>\S+)/u;

function words(command: string): string[] {
  return command
    .split(/\s+/u)
    .map((word) => word.replaceAll(/^["']|["']$/gu, ''))
    .filter((word) => word !== '');
}

function relative(path: string, repoDir: string): string {
  const inRepo = path.startsWith(`${repoDir}/`) ? path.slice(repoDir.length + 1) : path;
  return inRepo.replace(/^\.\//u, '').replace(/\/$/u, '');
}

function diffShown(args: string[], repoDir: string): Shown | null {
  if (args.some((arg) => SUMMARY_FLAGS.some((flag) => arg.startsWith(flag)))) {
    return null;
  }
  const separator = args.indexOf('--');
  const paths = separator === -1 ? [] : args.slice(separator + 1).map((p) => relative(p, repoDir));
  return paths.length === 0 || paths.includes('.') || paths.includes('') ? 'all' : paths;
}

/** What a Bash command shows of the change; null when it shows none of it. */
export function commandShown(command: string, repoDir: string): Shown | null {
  const [program, ...args] = words(command);
  if (program === 'git' && args[0] === 'diff') {
    return diffShown(args, repoDir);
  }
  if (program !== undefined && PRINTERS.has(program)) {
    return args.filter((arg) => !arg.startsWith('-')).map((arg) => relative(arg, repoDir));
  }
  return null;
}

function resultText(block: Record<string, unknown>): string {
  const { content } = block;
  if (typeof content === 'string') {
    return content;
  }
  return Array.isArray(content)
    ? content
        .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
        .join('')
    : '';
}

/** Walks the log in order, collecting what the agent was shown. */
class Reader {
  whole = false;
  readonly opened = new Set<string>();
  private readonly pending = new Map<string, Shown>();
  private readonly saved = new Map<string, Shown>();

  constructor(private readonly repoDir: string) {}

  private show(shown: Shown): void {
    if (shown === 'all') {
      this.whole = true;
      return;
    }
    for (const path of shown) {
      this.opened.add(path);
    }
  }

  use(block: Record<string, unknown>): void {
    const input = isRecord(block.input) ? block.input : {};
    if (block.name === 'Read' && typeof input.file_path === 'string') {
      const savedShown = this.saved.get(input.file_path);
      this.show(savedShown ?? [relative(input.file_path, this.repoDir)]);
      return;
    }
    const shown =
      block.name === 'Bash' && typeof input.command === 'string'
        ? commandShown(input.command, this.repoDir)
        : null;
    if (shown && typeof block.id === 'string') {
      this.pending.set(block.id, shown);
    }
  }

  result(block: Record<string, unknown>): void {
    const shown = typeof block.tool_use_id === 'string' && this.pending.get(block.tool_use_id);
    if (!shown || block.is_error === true) {
      return;
    }
    const savedTo = SAVED.exec(resultText(block))?.groups?.path;
    if (savedTo === undefined) {
      this.show(shown);
    } else {
      this.saved.set(savedTo, shown);
    }
  }

  wasOpened(path: string): boolean {
    return (
      this.whole || [...this.opened].some((shown) => path === shown || path.startsWith(`${shown}/`))
    );
  }
}

/** The coverage of `files` (the ignored ones already left out) by the agent's log `events`. */
export function reviewCoverage(
  events: readonly unknown[],
  files: readonly ReviewedFile[],
  repoDir: string,
): AgentReviewCoverage {
  const reader = new Reader(repoDir);
  for (const event of events.filter((value) => isRecord(value))) {
    for (const block of contentBlocks(event)) {
      if (block.type === 'tool_use') {
        reader.use(block);
      } else if (block.type === 'tool_result') {
        reader.result(block);
      }
    }
  }
  const counted = files.filter((file) => file.lines > 0);
  return {
    files: counted.length,
    lines: counted.reduce((sum, file) => sum + file.lines, 0),
    unopened: counted
      .filter((file) => !reader.wasOpened(file.path))
      .toSorted((a, b) => b.lines - a.lines),
  };
}
