// The text the implementer gets from CI: a failed check (its failed step's log, annotations, summary), another job's log, a bot's comment; browser-safe.
import { stripAnsi } from './ansi';

/** A log keeps its last lines, at most this many. */
export const MAX_CI_LOG_LINES = 300;
/** One block's text, at most this many characters (the log is cut first). */
export const MAX_CI_TEXT_CHARS = 32_768;
export const MAX_CI_ANNOTATIONS = 50;

export type CheckAnnotation = {
  path: string;
  startLine: number | null;
  level: 'notice' | 'warning' | 'failure';
  message: string;
};

export type FailedCheck = {
  name: string;
  conclusion: string;
  url: string | null;
  /** `output.title`, `output.summary` and `output.text` of the check run (empty for Actions jobs). */
  output: { title: string | null; summary: string | null; text: string | null };
  annotations: readonly CheckAnnotation[];
  /** The job's log for a GitHub Actions check; null for other CI, whose logs GitHub does not have. */
  log: string | null;
};

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/u;
const STEP_START = '##[group]Run ';
const JOB_END = /^(?:Post job cleanup\.|Cleaning up orphan processes)$/u;
const MARKER = /^##\[(?<kind>[\w-]+)[^\]]*\]/u;
const MARKER_LABELS: Record<string, string> = { error: 'Error: ', warning: 'Warning: ' };
const EXIT_CODE = /^Process completed with exit code \d+\.$/u;

/** A log line without its timestamp and colours. */
function cleanLine(line: string): string {
  return stripAnsi(line.replace(TIMESTAMP, ''));
}

/** `##[error]`, `##[warning]`… as plain text; other markers (`##[start-action …]`…) are dropped. */
function unmarked(line: string): string[] {
  const marker = MARKER.exec(line);
  if (!marker) {
    return [line];
  }
  const label = MARKER_LABELS[marker.groups?.kind ?? ''];
  return label === undefined ? [] : [`${label}${line.slice(marker[0].length)}`];
}

/**
 * A group's header only: a step's group holds the script it runs, its shell and environment, which
 * hide the output the agent needs.
 */
function withoutGroupBodies(lines: readonly string[]): string[] {
  let inGroup = false;
  return lines.flatMap((line) => {
    if (line.startsWith('##[group]')) {
      inGroup = true;
      return [line.slice('##[group]'.length)];
    }
    if (line.startsWith('##[endgroup]')) {
      inGroup = false;
      return [];
    }
    return inGroup ? [] : unmarked(line);
  });
}

/** The job's steps: the runner's setup before the first step and its cleanup after are left out. */
function stepRange(lines: readonly string[], failedOnly: boolean): readonly string[] {
  const starts = lines.flatMap((line, i) => (line.startsWith(STEP_START) ? [i] : []));
  const end = lines.findIndex((line) => JOB_END.test(line));
  const stop = end === -1 ? lines.length : end;
  if (starts.length === 0) {
    return lines.slice(0, stop);
  }
  if (!failedOnly) {
    return lines.slice(starts[0], stop);
  }
  const error = lines.findIndex((line) => line.startsWith('##[error]'));
  const at = error === -1 ? stop : error;
  const start = starts.findLast((i) => i <= at) ?? starts[0] ?? 0;
  const next = starts.find((i) => i > at) ?? stop;
  return lines.slice(start, Math.min(next, stop));
}

/** The end of a job's log, cleaned: the failed step only (`failedOnly`), else every step. */
export function jobLogTail(log: string, failedOnly: boolean): string {
  const lines = withoutGroupBodies(
    stepRange(
      log.split(/\r?\n/u).map((line) => cleanLine(line)),
      failedOnly,
    ),
  );
  const kept = lines.slice(-MAX_CI_LOG_LINES);
  const cut = lines.length - kept.length;
  return `${cut > 0 ? `(${cut} earlier lines cut)\n` : ''}${kept.join('\n')}`.trim();
}

/** A fence longer than any backtick run in the text, so the text cannot close it. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/gu)].map((run) => run[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/** Failures and warnings, without the runner's "exit code" line (the log shows it). */
function annotationLines(annotations: readonly CheckAnnotation[]): string[] {
  const kept = annotations.filter(
    (note) => note.level !== 'notice' && !EXIT_CODE.test(note.message.trim()),
  );
  const lines = kept.slice(0, MAX_CI_ANNOTATIONS).map((note) => {
    const where = note.startLine === null ? note.path : `${note.path}:${note.startLine}`;
    return `- ${where}: ${note.level}: ${note.message.trim()}`;
  });
  const more = kept.length - lines.length;
  return more > 0 ? [...lines, `- (${more} more)`] : lines;
}

function outputText(output: FailedCheck['output']): string {
  return [output.title, output.summary, output.text]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join('\n\n');
}

/** Room the fence and its `text` tag take around the log. */
const FENCE_ROOM = 32;

/** Within the limit: the log loses its start first, so the header and annotations stay. */
function capped(head: string, log: string): string {
  const room = MAX_CI_TEXT_CHARS - head.length - FENCE_ROOM;
  if (log === '' || room <= 0) {
    return head.slice(0, MAX_CI_TEXT_CHARS);
  }
  const tail = log.length > room ? log.slice(-room) : log;
  return `${head}${fenced(tail)}`;
}

function heading(title: string, url: string | null): string {
  return url === null ? `## ${title}\n` : `## ${title}\n${url}\n`;
}

/** What the implementer reads about one failed check. */
export function failedCheckText(check: FailedCheck): string {
  const parts = [heading(`Failed check: ${check.name} (${check.conclusion})`, check.url)];
  const output = outputText(check.output);
  if (output !== '') {
    parts.push(`${output}\n`);
  }
  const notes = annotationLines(check.annotations);
  if (notes.length > 0) {
    parts.push(`Annotations:\n${notes.join('\n')}\n`);
  }
  const log = check.log === null ? '' : jobLogTail(check.log, true);
  if (log !== '') {
    parts.push('Log of the failed step:\n');
  }
  return capped(parts.join('\n'), log);
}

/** Another job of the failed check's workflow run, which may hold the findings. */
export function relatedJobText(job: { name: string; url: string | null; log: string }): string {
  const log = jobLogTail(job.log, false);
  return capped(`${heading(`Log of the job ${job.name}`, job.url)}\n`, log);
}

/** A bot's comment on the pull request (a CI report, for example). */
export function botCommentText(comment: { author: string; url: string; body: string }): string {
  const head = `${heading(`Comment by ${comment.author} on the pull request`, comment.url)}\n`;
  return `${head}${comment.body.trim()}`.slice(0, MAX_CI_TEXT_CHARS);
}
