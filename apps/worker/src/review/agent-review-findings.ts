// The agent review's answer format, and its findings read back as draft comments.
import { diffExcerpt, type AgentDraft } from '@union/core';

/** Drafts beyond this are dropped: a review that long is noise, whatever the prompt says. */
const MAX_COMMENTS = 30;

/** Appended by the host, never editable: the drafts are read from this block. */
export const FINDINGS_FORMAT = `End your answer with one fenced \`json\` block, and nothing after it:

\`\`\`json
{"summary": "", "comments": [{"path": "src/cart.ts", "side": "new", "startLine": 41, "endLine": 43, "body": "…"}]}
\`\`\`

- \`path\`: the file's path as the diff shows it.
- \`side\`: \`"new"\` for added or unchanged lines, numbered as in the changed file; \`"old"\` only for removed lines, numbered as in the base file.
- \`startLine\` and \`endLine\`: lines inside the diff's hunks; the same number for one line.
- \`body\`: the comment, in markdown.
- \`summary\`: a remark on the change as a whole, or \`""\`. Do not repeat the line comments there.`;

/** The same for a stack: each comment says which pull request's diff its lines are in. */
export const STACK_FINDINGS_FORMAT = `${FINDINGS_FORMAT}
- \`pr\`: in each comment, the number of the pull request whose diff shows those lines. A comment on how pull requests fit together goes on the higher one.`;

type Finding = {
  /** In a stack, the pull request the comment is about; null when the agent did not say. */
  pr: number | null;
  path: string;
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  body: string;
};

export type Findings = { summary: string; comments: Finding[] };

const JSON_BLOCK = /```json[^\n]*\n(?<json>[\s\S]*?)\n\s*```/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function line(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

/** One comment as the agent wrote it; null when it lacks a path, a line or a text. */
function findingOf(value: unknown): Finding | null {
  if (!isRecord(value)) {
    return null;
  }
  const path = text(value.path);
  const body = text(value.body);
  const start = line(value.startLine);
  const end = line(value.endLine ?? value.startLine);
  if (path === '' || body === '' || start === null || end === null) {
    return null;
  }
  return {
    pr: line(value.pr),
    path,
    side: value.side === 'old' ? 'old' : 'new',
    startLine: Math.min(start, end),
    endLine: Math.max(start, end),
    body,
  };
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return null;
  }
}

/** The last `json` block of the answer; null when there is none or it is not the expected shape. */
export function parseFindings(answer: string): Findings | null {
  const block = [...answer.matchAll(JSON_BLOCK)].at(-1)?.groups?.json;
  const parsed = block === undefined ? null : parseJson(block);
  if (!isRecord(parsed) || !Array.isArray(parsed.comments)) {
    return null;
  }
  const comments = parsed.comments.map((item) => findingOf(item)).filter((item) => item !== null);
  return { summary: text(parsed.summary), comments };
}

function lines(finding: Finding): string {
  const range =
    finding.startLine === finding.endLine
      ? `line ${finding.startLine}`
      : `lines ${finding.startLine}-${finding.endLine}`;
  return finding.side === 'old' ? `${range} (removed code)` : range;
}

function general(body: string): AgentDraft {
  return { kind: 'general', path: '', side: 'new', startLine: 0, endLine: 0, excerpt: '', body };
}

/**
 * The findings as drafts: on the diff's lines when they are in it (with the code as the excerpt),
 * else on the whole change with the place they point at, so nothing the agent said is lost.
 */
export function toDrafts(
  findings: Findings,
  patchOf: (path: string) => string | undefined,
): AgentDraft[] {
  const drafts = findings.comments.slice(0, MAX_COMMENTS).map((finding): AgentDraft => {
    const patch = patchOf(finding.path);
    const excerpt =
      patch === undefined
        ? null
        : diffExcerpt(patch, finding.side, finding.startLine, finding.endLine);
    if (excerpt === null) {
      return general(`**${finding.path}**, ${lines(finding)}:\n\n${finding.body}`);
    }
    const { path, side, startLine, endLine, body } = finding;
    return { kind: 'line', path, side, startLine, endLine, excerpt, body };
  });
  return findings.summary === '' ? drafts : [general(findings.summary), ...drafts];
}
