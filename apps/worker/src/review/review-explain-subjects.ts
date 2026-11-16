// What an Explain turn is about, for its prompt: lines with their text, a file of the change, or the whole change.

import { hunksOf, subjectLabel, type ExplainSubject, type ReviewExplanation } from '@union/core';

import type { ReviewTarget } from './agent-review-target';

/** The whole change lists at most this many files; the agent reads the rest with git. */
const MAX_LISTED_FILES = 300;

function linesOf(
  target: ReviewTarget,
  subject: Extract<ExplainSubject, { kind: 'lines' }>,
): string {
  const { path, side, start, end, excerpt } = subject;
  const where =
    side === 'new'
      ? `\`${path}\`, lines ${start}-${end} at HEAD`
      : `\`${path}\`, lines ${start}-${end} before the change (removed by it: \`git show ${target.base}:${path}\`)`;
  return `${where}:\n\n\`\`\`\n${excerpt}\n\`\`\``;
}

function counts(target: ReviewTarget, path: string): string {
  const hunks = hunksOf(target.patchOf(path) ?? '');
  const added = hunks.reduce((sum, hunk) => sum + hunk.additions, 0);
  const removed = hunks.reduce((sum, hunk) => sum + hunk.deletions, 0);
  return `+${added} −${removed}`;
}

function fileOf(target: ReviewTarget, path: string): string {
  return `The file \`${path}\` (${counts(target, path)}): read its diff with \`git diff ${target.base}...HEAD -- ${path}\`, and the file itself for what the diff leaves out.`;
}

function changeOf(target: ReviewTarget): string {
  const listed = target.paths
    .slice(0, MAX_LISTED_FILES)
    .map((path) => `- \`${path}\` (${counts(target, path)})`);
  const more = target.paths.length - listed.length;
  const rest = more > 0 ? `\n- and ${more} more: \`git diff --stat ${target.base}...HEAD\`` : '';
  return `The whole change, ${target.paths.length} files:\n\n${listed.join('\n')}${rest}`;
}

function subjectOf(target: ReviewTarget, subject: ExplainSubject): string {
  if (subject.kind === 'lines') {
    return linesOf(target, subject);
  }
  return subject.kind === 'file' ? fileOf(target, subject.path) : changeOf(target);
}

/** The turn's subjects, each in its own part; empty when the question is about none. */
export function subjectsOf(target: ReviewTarget, turn: ReviewExplanation): string {
  if (turn.subjects.length === 0) {
    return '';
  }
  const parts = turn.subjects.map((subject) => subjectOf(target, subject));
  const heading =
    turn.subjects.length === 1 ? '## What it is about' : '## What it is about, each part';
  return `${heading}\n\n${parts.join('\n\n')}`;
}

/** The question asked, or what to explain when only subjects were given. */
export function questionOf(turn: ReviewExplanation): string {
  if (turn.question !== null) {
    return turn.question;
  }
  const only = turn.subjects.length === 1 ? turn.subjects[0] : undefined;
  return only ? ASK[only.kind] : 'Explain how these work together, and why the change has them.';
}

const ASK: Record<ExplainSubject['kind'], string> = {
  lines: 'Explain how these lines work, and why the change has them.',
  file: 'Explain what this file does in the change, and why the change has it.',
  change: 'Explain how the change works, its main path first, and why it is built this way.',
};

/** A turn's subjects named in a line, for the earlier turns of a conversation. */
export function subjectNames(turn: ReviewExplanation): string {
  return turn.subjects.map((subject) => subjectLabel(subject)).join(', ');
}
