// How Explain subjects and conversations are named: `path:3-5`, a file, the whole change, a first question. Pure.

import type { ExplainSubject } from '../schema/schema-review-explanations';

const MAX_CONVERSATION_TITLE = 80;

function lineRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

/** How a subject is named: `path:3-5`, `path`, or the whole change. */
export function subjectLabel(subject: ExplainSubject): string {
  if (subject.kind === 'lines') {
    return `${subject.path}:${lineRange(subject.start, subject.end)}`;
  }
  return subject.kind === 'file' ? subject.path : 'The whole change';
}

/** A new conversation's title: its first question's first line, else its first subject. */
export function conversationTitle(question: string | null, subjects: ExplainSubject[]): string {
  const line = question?.split('\n').find((candidate) => candidate.trim() !== '');
  const [first] = subjects;
  const title = line?.trim() ?? (first ? subjectLabel(first) : 'Explain');
  return title.length > MAX_CONVERSATION_TITLE
    ? `${title.slice(0, MAX_CONVERSATION_TITLE - 1)}…`
    : title;
}
